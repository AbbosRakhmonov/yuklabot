const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { randomUUID } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");
const mongoose = require("mongoose");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const { config } = require("../src/config/config");
const { adminCommand } = require("../src/commands/admin.command");
const { createAdminRouter } = require("../src/dashboard/adminRouter");
const { UpdateQueue } = require("../src/middleware/backgroundQueue");

test("unconfigured Telegram admin is denied", async () => {
  config.admin.chatId = 0;
  const replies = [];
  await adminCommand({ from: { id: 10 }, reply: text => replies.push(text) });
  assert.equal(replies.length, 1);
  assert.match(replies[0], /faqat bot admini/);
});

test("dashboard requires configuration, revokes cookies and closes live streams", async t => {
  const app = express();
  app.use((req, _res, next) => {
    Object.defineProperty(req.socket, "remoteAddress", { value: "127.0.0.1", configurable: true });
    next();
  });
  app.use(express.json());
  app.use("/admin", createAdminRouter({}));
  const socketPath = process.platform === "win32" ? "\\\\.\\pipe\\yuklabot-" + randomUUID()
    : path.join(os.tmpdir(), "yuklabot-" + randomUUID() + ".sock");
  const server = app.listen(socketPath);
  await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = "/admin/api/";
  const fetch = (path, options = {}) => new Promise((resolve, reject) => {
    const req = http.request({ socketPath, path, method: options.method, headers: options.headers }, res => {
      resolve(new Response(res.statusCode === 204 ? null : require("node:stream").Readable.toWeb(res), {
        status: res.statusCode, headers: res.headers,
      }));
    });
    req.on("error", reject);
    req.end(options.body);
  });
  const login = password => fetch(base + "login", { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ username: config.admin.username, password }) });
  config.admin.password = "";
  assert.equal((await login("")).status, 503);
  config.admin.password = randomUUID();
  const res = await login(config.admin.password);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).token, undefined);
  const cookie = res.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  const headers = { cookie: cookie.split(";")[0] };
  assert.equal((await fetch(base + "session", { headers })).status, 200);
  await t.test("recipient history scopes both originals and forwarded materials", async history => {
    const id = new mongoose.Types.ObjectId();
    const source = "https://youtu.be/abcdefghijk";
    history.mock.method(require("../src/models/User").default, "findById", () => ({
      select: () => ({ lean: async () => ({ _id: id, telegramId: 17 }) }),
    }));
    history.mock.method(require("../src/models/Download").default, "aggregate", async pipeline => {
      assert.equal(pipeline[0].$match.user.toString(), String(id));
      const forwards = pipeline.find(stage => stage.$unionWith).$unionWith;
      assert.equal(forwards.pipeline[0].$match.user.toString(), String(id));
      assert.equal(pipeline.find(stage => stage.$group).$group._id, "$material");
      return [{ items: [{ url: source }], counts: [{ total: 1 }] }];
    });
    const endpoint = base + "history?userId=";
    assert.equal((await fetch(endpoint + id)).status, 401);
    assert.equal((await fetch(endpoint + "bad", { headers })).status, 400);
    const response = await fetch(endpoint + id, { headers });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.pagination.total, 1);
    assert.equal(data.items[0].user.telegramId, 17);
    assert.equal(data.items[0].preview, "https://www.youtube-nocookie.com/embed/abcdefghijk");
  });
  await t.test("failure drilldown preserves the statistics window and links callbacks to their root request", async sub => {
    const end = Date.now() - 10;
    const url = base + "failures?platform=youtube&reason=timeout&asOf=" + end;
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url + "&page=-1", { headers })).status, 400);
    sub.mock.method(require("../src/models/DeliveryAttempt").default, "aggregate", async pipeline => {
      const match = pipeline[0].$match;
      assert.equal(match.platform, "youtube");
      assert.equal(match.reason, "timeout");
      assert.equal(match.outcome, "failed");
      assert.equal(+match.finishedAt.$gte, end - 86400000);
      assert.equal(+match.finishedAt.$lte, end);
      assert.deepEqual(pipeline[1].$set.root.$ifNull, ["$requestId", "$_id"]);
      assert.equal(pipeline.at(-1).$facet.items[1].$skip, 20);
      return [{ items: [], users: [{ n: 2 }], links: [], total: [{ n: 3 }] }];
    });
    const response = await fetch(url + "&page=2", { headers });
    assert.deepEqual(await response.json(), { items: [], users: 2, links: 0, total: 3 });
  });
  await t.test("statistics endpoint feeds platform counters and both charts", async stats => {
    stats.mock.method(require("../src/models/DeliveryAttempt").default, "aggregate", async () => [
      { _id: { platform: "instagram", outcome: "success" }, count: 3 },
      { _id: { platform: "instagram", outcome: "failed", reason: "source" }, count: 1 },
      { _id: { platform: "instagram", outcome: "cancelled" }, count: 2 },
    ]);
    const counts = { User: 8, Download: 15, YoutubeDownload: 9, InstagramDownload: 4, TiktokDownload: 2 };
    for (const [name, count] of Object.entries(counts)) {
      stats.mock.method(require("../src/models/" + name).default, "countDocuments", async () => count);
    }
    stats.mock.method(require("../src/models/Download").default, "aggregate", async () => [
      { _id: "video", count: 9 }, { _id: "reel", count: 4 }, { _id: "post", count: 2 },
    ]);
    const response = await fetch(base + "stats", { headers });
    assert.equal(response.status, 200);
    const data = await response.json();
    const html = require("../src/dashboard/dashboardView").getDashboardHtml();
    const script = html.slice(html.indexOf("function renderStats("), html.indexOf("// Active Tasks Logic"));
    const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(match => [match[1], {}]));
    const charts = [];
    const scope = { data, document: { getElementById: id => elements.get(id) },
      Chart: class { constructor(_canvas, options) { charts.push(options.data); } },
    };
    require("node:vm").runInNewContext("let platformChartInstance, mediaChartInstance; " + script + ";renderStats(data)", scope);
    assert.match(elements.get("deliveryOutcomes").innerHTML, /75\.0%/);
    assert.match(elements.get("deliveryOutcomes").innerHTML, /Manbadan olish: 1/);
    assert.equal(elements.get("statYoutubeCount").textContent, "9");
    assert.deepEqual(Array.from(charts[0].datasets[0].data), [9, 4, 2]);
    assert.equal(charts[1].datasets[0].data[charts[1].labels.indexOf("Reel")], 4);
  });
  const stream = await fetch(base + "events", { headers });
  const reader = stream.body.getReader();
  await reader.read();
  assert.equal((await fetch(base + "logout", { headers, method: "POST" })).status, 204);
  assert.equal((await reader.read()).done, true);
  assert.equal((await fetch(base + "session", { headers })).status, 401);
  for (let i = 0; i < 8; i++) assert.equal((await login("wrong")).status, 401);
  assert.equal((await login("wrong")).status, 429);
});

test("queue recovery preserves pending jobs and suppresses duplicates", async t => {
  // A shared collection across two worker instances isolates the restart logic.
  const rows = new Map();
  const jobs = {
    createIndex: async () => {},
    find: ({ state }) => [...rows.values()].filter(row => row.state === state),
    distinct: async (_, { state }) => [...new Set([...rows.values()].filter(row => row.state === state).map(row => row.key))],
    findOne: async ({ _id }) => rows.get(_id),
    insertOne: async row => {
      assert.equal(rows.has(row._id), false);
      rows.set(row._id, row);
    },
    countDocuments: async ({ key, state }) => [...rows.values()].filter(row => row.key === key && state.$in.includes(row.state)).length,
    findOneAndUpdate: async ({ key, state }, { $set }) => {
      const row = [...rows.values()].find(row => row.key === key && row.state === state);
      return row && Object.assign(row, $set);
    },
    updateOne: async ({ _id }, { $set, $unset }) => {
      const row = Object.assign(rows.get(_id), $set);
      for (const field of Object.keys($unset ?? {})) delete row[field];
    },
  };
  await verifyRecovery(t, jobs);
});

test("MongoDB integration: pending updates survive restart", {
  skip: !process.env.TEST_MONGODB_URI && "set TEST_MONGODB_URI to a test MongoDB instance",
  timeout: 20000,
}, async t => {
  const db = await mongoose.createConnection(process.env.TEST_MONGODB_URI, {
    dbName: "yuklabot_test_" + randomUUID().replaceAll("-", ""),
    serverSelectionTimeoutMS: 3000,
  }).asPromise();
  t.after(async () => { await db.dropDatabase(); await db.close(); });
  await verifyRecovery(t, db.collection("telegram_updates"));
});

async function verifyRecovery(t, jobs) {
  const handled = [];
  const bot = { telegram: {}, botInfo: { id: 1 }, handleUpdate: async u => { handled.push(u.update_id); } };
  const update = id => ({ update_id: id, message: { message_id: id, text: "test",
    from: { id: 12 }, chat: { id: 12, type: "private" } } });
  let release;
  const busy = new Promise(resolve => { release = resolve; });
  const first = new UpdateQueue({ ...bot, handleUpdate: () => busy }, jobs);
  t.after(() => { first.stop(); release(); });
  await first.start();
  await first.accept(update(1));
  await first.accept(update(2));
  assert.equal((await jobs.findOne({ _id: 2 })).state, "queued");
  first.stop();
  release();
  const waitFor = async predicate => {
    for (let i = 0; i < 200; i++) { if (await predicate()) return; await delay(10); }
    assert.fail("worker did not reach expected state");
  };
  await waitFor(async () => (await jobs.findOne({ _id: 1 })).state === "done");
  const second = new UpdateQueue(bot, jobs);
  t.after(() => second.stop());
  await second.start();
  await second.accept(update(2));
  await waitFor(async () => (await jobs.findOne({ _id: 2 })).state === "done");
  await second.accept(update(2));
  assert.deepEqual(handled, [2]);
}

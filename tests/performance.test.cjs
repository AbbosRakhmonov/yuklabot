const test = require("node:test");
const assert = require("node:assert/strict");
const { setImmediate: tick } = require("node:timers/promises");
const { UpdateQueue } = require("../src/middleware/backgroundQueue");
const { YoutubeService } = require("../src/services/youtube.service");

const update = (id, user) => ({
  update_id: id, message: { from: { id: user }, chat: { id: user }, text: "test" },
});

test("polling overlaps admissions across users, preserves order and acknowledges the batch", async () => {
  const batch = [update(1, 1), update(2, 1), ...Array.from({ length: 10 }, (_, i) => update(i + 3, i + 2))];
  let active = 0, peak = 0;
  const inserted = [];
  const offsets = [];
  const jobs = {
    async findOne() { active++; peak = Math.max(peak, active); await tick(); return null; },
    async countDocuments() { return 0; },
    async insertOne(row) { await tick(); inserted.push(row._id); active--; },
    async findOneAndUpdate() { return null; },
  };
  const telegram = {
    async deleteWebhook() {},
    async getUpdates(_timeout, _limit, offset) {
      offsets.push(offset);
      if (!offset) return batch;
      assert.equal(inserted.length, batch.length);
      queue.stop();
      return [];
    },
  };
  const queue = new UpdateQueue({ telegram, botInfo: { id: 10 } }, jobs);
  await queue.poll();
  assert.deepEqual(offsets, [0, 13]);
  assert.equal(peak, 6);
  assert.ok(inserted.indexOf(1) < inserted.indexOf(2));
  assert.ok(inserted.indexOf(3) < inserted.indexOf(2));
});

test("a delayed notice edit does not hold up this delivery or the next link", async () => {
  let acknowledge;
  const pending = new Promise(resolve => { acknowledge = resolve; });
  const processed = [], finished = [], notices = [];
  const rows = [1, 2].map(id => ({ _id: id, update: update(id, 3), noticeId: id === 1 ? 12 : undefined }));
  const queue = new UpdateQueue({
    botInfo: { id: 10 },
    telegram: { async editMessageText() { await pending; } },
    async handleUpdate(item) { processed.push(item.update_id); },
  }, {
    async findOneAndUpdate() { return rows.shift(); },
    async updateOne({ _id }, { $set }) {
      if ($set.state === "done") finished.push(_id);
      if ($set.acceptedNoticeAt) notices.push(_id);
    },
  });
  const drained = queue.drain(3);
  try {
    await tick();
    assert.deepEqual(processed, [1, 2]);
    assert.deepEqual(finished, [1, 2]);
    assert.deepEqual(notices, []);
  } finally { acknowledge(); }
  await drained;
  await tick();
  assert.deepEqual(notices, [1]);
});

test("an admission failure holds later updates for that user until retry", async () => {
  let fail = true;
  const ids = [];
  const queue = new UpdateQueue({ telegram: {}, botInfo: { id: 10 } }, {
    async findOne() { return null; },
    async countDocuments() { return 0; },
    async insertOne(row) {
      if (fail && row._id === 1) throw new Error("database unavailable");
      ids.push(row._id);
    },
    async findOneAndUpdate() { return null; },
  });
  const result = await Promise.allSettled([queue.accept(update(1, 3)), queue.accept(update(2, 3)), queue.accept(update(3, 4))]);
  assert.deepEqual(result.map(r => r.status), ["rejected", "rejected", "fulfilled"]);
  fail = false;
  await Promise.all([queue.accept(update(1, 3)), queue.accept(update(2, 3))]);
  assert.deepEqual(ids, [3, 1, 2]);
  queue.stop();
});

test("YouTube reuses both menus without sharing download folders, refreshes after TTL and retries failures", async t => {
  let loads = 0;
  t.mock.method(YoutubeService.prototype, "getInfo", async function () {
    loads++;
    await tick();
    if (loads === 1) throw new Error("temporary failure");
    this.folderName = "owner-folder";
    this.data = { title: "Test", formats: [
      { format_id: "v", vcodec: "avc1", acodec: "none", width: 1280, height: 720 },
      { format_id: "a", ext: "m4a", vcodec: "none", acodec: "aac", abr: 128 },
    ] };
    return this.data;
  });
  let now = Date.now(), notices = 0;
  t.mock.method(Date, "now", () => now);
  const make = () => new YoutubeService("https://youtu.be/example");
  const notify = async () => { notices++; };
  const owner = make(), other = make();
  await assert.rejects(owner.getQualityMenu(notify), /temporary failure/);
  const [first, concurrent] = await Promise.all([owner.getQualityMenu(notify), other.getQualityMenu(notify)]);
  assert.deepEqual(first, concurrent);
  assert.equal(first.video[0].height, 720);
  assert.equal(first.audio[0].formatId, "a");
  assert.equal(other.toState().folderName, null);
  assert.equal(owner.toState().folderName, "owner-folder");
  await make().getQualityMenu(notify);
  assert.equal(loads, 2);
  assert.equal(notices, 2);
  now += 300001;
  await make().getQualityMenu(notify);
  assert.equal(loads, 3);
});

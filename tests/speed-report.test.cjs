const test = require("node:test");
const assert = require("node:assert/strict");
const { speedReport } = require("../src/dashboard/speedReport");
const { traceRequest, traceOutcome, deliveryInfo, requestHistory, queueTiming } = require("../src/utils/requestHistory");

test("speed report separates cache, uses nearest-rank p95 and excludes choices from slowest", async () => {
  async function* rows() {
    for (let id = 1; id <= 20; id++) yield { _id: id, key: 21, platform: "youtube", mode: "fresh",
      metrics: { queue: 0, preparation: id, telegram: 5, choice: id === 1 ? 50000 : 0 } };
    yield { _id: 25, key: 32, platform: "youtube", mode: "cached",
      metrics: { queue: 10, preparation: 5, telegram: 5, choice: 0 } };
    yield { platform: "youtube" };
  }
  const [cached, fresh] = await speedReport(rows());
  assert.equal(cached.count, 1);
  assert.equal(fresh.count, 20);
  assert.deepEqual(fresh.stages.preparation, { median: 10.5, p95: 19 });
  assert.deepEqual(fresh.slowest, { id: 20, userId: 21, ms: 25 });
});

test("callback timing separates queue, menu wait, preparation and media send", async t => {
  let clock = 1020, saved;
  t.mock.method(Date, "now", () => clock);
  t.mock.method(requestHistory(), "updateOne", async (_, update) => { saved = update; });
  const ctx = { update: { update_id: 9 }, callbackQuery: { data: "720" }, from: { id: 3 },
    session: { __scenes: { state: { requestId: 7, waitingSince: 110 } } }, sendMessage: async () => ({}),
    telegram: { callApi: async () => { clock += 50; } } };
  await queueTiming.run({ received: 1000, started: 1020 }, () => traceRequest(ctx, async () => {
    clock += 80;
    deliveryInfo({ platform: "youtube", mode: "fresh" });
    await ctx.telegram.callApi("sendVideo", {});
    traceOutcome("success");
  }));
  assert.deepEqual(saved.$inc, { "metrics.queue": 20, "metrics.preparation": 80, "metrics.telegram": 50, "metrics.choice": 890 });
  assert.ok(saved.$set.measuredAt);
});

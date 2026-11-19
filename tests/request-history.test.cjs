const test = require("node:test");
const assert = require("node:assert/strict");
const { requestHistory, traceRequest, traceOutcome } = require("../src/utils/requestHistory");

test("a menu reply and later delivery belong to the original link", async t => {
  const writes = [];
  t.mock.method(requestHistory(), "updateOne", async (filter, change) => writes.push({ filter, change }));
  const ctx = { from: { id: 12 }, update: { update_id: 41 }, message: { text: "https://youtu.be/example" },
    session: {}, sendMessage: async text => ({ text }) };
  await traceRequest(ctx, async () => {
    await ctx.sendMessage("Formatni tanlang");
    ctx.session.__scenes = { current: "youtube", state: { requestId: 41 } };
  });
  const click = { ...ctx, message: undefined, callbackQuery: { data: "720" }, update: { update_id: 44 } };
  await traceRequest(click, async () => traceOutcome("success"));
  assert.deepEqual(writes.map(w => w.filter), [{ _id: 41, key: 12 }, { _id: 41, key: 12 }]);
  assert.deepEqual(writes.map(w => w.change.$set.outcome), ["waiting", "success"]);
  assert.equal(writes[0].change.$push.events.$each[0].detail, "Formatni tanlang");
  assert.deepEqual(writes[1].change.$push.events.$each.map(e => e.kind), ["choice", "success"]);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { setImmediate: tick } = require("node:timers/promises");
const { sharedDownload, rememberVideo } = require("../src/helpers/sharedDownload");
const { observeAttempt, deliveryStage } = require("../src/utils/deliveryAttempt");
const { ProcessCancelledError } = require("../src/utils/processManager");
const Attempt = require("../src/models/DeliveryAttempt").default;

const chatContext = {
  sendMessage: async () => ({ chat: { id: 1 }, message_id: 42 }),
  telegram: { deleteMessage: async () => true },
};

test("concurrent recipients reuse Telegram file IDs and distinct qualities download separately", async () => {
  const uploads = [], deliveries = [];
  const run = (chat, quality) => sharedDownload({ ...chatContext,
    replyWithVideo: async file => deliveries.push([chat, file]),
  }, ["youtube", "same-id", quality], async () => null, async () => {
    uploads.push(quality);
    await tick();
    rememberVideo({ video: { file_id: "file-" + quality }, caption: "Video" });
  });
  await Promise.all([run(1, 720), run(2, 720), run(3, 720), run(4, 1080)]);
  assert.deepEqual(uploads, [720, 1080]);
  assert.deepEqual(deliveries, [[2, "file-720"], [3, "file-720"]]);
});

test("shared source failures count per requester and a later request can retry", async t => {
  const writes = [];
  t.mock.method(Attempt, "updateOne", async (filter, update) => writes.push([filter._id, update.$setOnInsert]));
  let productions = 0;
  const run = (id, fail) => observeAttempt({ update: { update_id: id } }, "youtube", "source",
    () => sharedDownload(chatContext, ["youtube", "retry", 720], async () => null, async () => {
      productions++;
      await tick();
      if (fail) throw new Error("source offline");
    }));
  await Promise.all([assert.rejects(run(1, true)), assert.rejects(run(2, true))]);
  await run(3, false);
  assert.equal(productions, 2);
  assert.deepEqual(writes.map(([id, row]) => [id, row.outcome, row.reason]).sort(),
    [[1, "failed", "source"], [2, "failed", "source"], [3, "success", undefined]]);
});

test("leader cancellation permits another requester to finish; Telegram errors stay recipient-specific", async t => {
  const writes = [];
  t.mock.method(Attempt, "updateOne", async (filter, update) => writes.push([filter._id, update.$setOnInsert]));
  let tries = 0;
  const run = id => observeAttempt({ update: { update_id: id } }, "tiktok", "source", () =>
    sharedDownload({ ...chatContext, replyWithVideo: async () => { throw new Error("chat unavailable"); } },
      ["tiktok", "post"], async () => null, async () => {
        await tick();
        if (++tries === 1) throw new ProcessCancelledError();
        deliveryStage("telegram");
        rememberVideo({ video: { file_id: "vid" } });
      }));
  const results = await Promise.allSettled([run(1), run(2), run(3)]);
  assert.deepEqual(results.map(row => row.status), ["rejected", "fulfilled", "rejected"]);
  assert.equal(tries, 2);
  assert.deepEqual(writes.map(([id,row]) => [id,row.outcome,row.reason]).sort(),
    [[1, "cancelled", undefined], [2, "success", undefined], [3, "failed", "telegram"]]);
});

test("a waiting recipient can cancel without interrupting the producer", async () => {
  const gate = Promise.withResolvers(), token = Promise.withResolvers();
  const ctx = { ...chatContext, from: { id: 21 }, sendMessage: async (_text, options) => {
    token.resolve(options.reply_markup.inline_keyboard[0][0].callback_data);
    return { chat: { id: 21 }, message_id: 2 };
  } };
  const key = ["instagram", "cancel-waiter"];
  const owner = sharedDownload(chatContext, key, async () => null, () => gate.promise);
  const waiter = sharedDownload(ctx, key, async () => null, async () => assert.fail("cancelled waiter downloaded"));
  await require("../src/utils/downloadCancel").handleCancelDownload({
    callbackQuery: { data: await token.promise }, from: ctx.from, answerCbQuery: async () => {},
  });
  await assert.rejects(waiter, ProcessCancelledError);
  gate.resolve();
  await owner;
});

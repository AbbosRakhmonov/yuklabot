const test = require("node:test");
const assert = require("node:assert/strict");
const { findAndSendMedia } = require("../src/helpers/findAndSendMedia");
const { sendAlbum } = require("../src/helpers/sendAlbum");
const { AlbumDeliveryError } = require("../src/utils/errors");
const { activeTasks } = require("../src/utils/activeTasks");

function copyCached(ids, copyMessages) {
  const model = { updateOne: async () => {}, findOne: query => {
    assert.deepEqual(query.cacheIncomplete, { $ne: true });
    return { sort: () => ({
    lean: async () => ({ _id: "cache", chatId: 10, carousel: ids.map(messageId => ({ messageId })) }),
    }) };
  } };
  return findAndSendMedia({ chat: { id: 20 }, telegram: { copyMessages } }, model, {});
}

test("an empty cached copy allows a fresh download", async () => {
  assert.equal(await copyCached([11, 12], async () => []), null);
});

test("a partial cached copy does not start a second full download", async () => {
  await assert.rejects(copyCached([11, 12], async () => [{ message_id: 21 }]), AlbumDeliveryError);
});

test("a failed second copy batch preserves the first batch's delivery count", async () => {
  const ids = Array.from({ length: 101 }, (_, i) => i + 1);
  await assert.rejects(copyCached(ids, async (_to, _from, batch) => {
    if (batch.length === 1) throw new Error("unavailable");
    return batch.map(message_id => ({ message_id }));
  }), /101 ta fayldan 100 tasi/);
});

test("partial fresh albums retain the caption and cannot enter the cache", async () => {
  const captions = [];
  const items = ["broken", "ok"].map(id => ({ itemId: id, type: "photo", media: () => id }));
  await assert.rejects(sendAlbum({
    replyWithMediaGroup: async () => { throw new Error("bad item"); },
    replyWithPhoto: async (id, options) => {
      if (id === "broken") throw new Error("bad item");
      captions.push(options.caption);
      return { message_id: 55 };
    },
  }, items, "Post"), AlbumDeliveryError);
  assert.deepEqual(captions, ["Post"]);
});

test("cancellation before or during a task is recorded as cancelled", () => {
  for (const alreadyAborted of [false, true]) {
    const source = new AbortController();
    if (alreadyAborted) source.abort();
    const task = activeTasks.startTask({ userId: 1, platform: "youtube", url: "test", signal: source.signal });
    source.abort();
    assert.equal(task.signal.aborted, true);
    task.fail(new Error("aborted"));
    assert.equal(activeTasks.getRecentCompleted()[0].stage, "cancelled");
  }
});

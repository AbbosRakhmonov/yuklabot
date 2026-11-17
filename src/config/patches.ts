// src/config/patches.ts
// Runtime fixes for dependencies. Import right after env, before the bot.
import path from "path";
import type { Readable } from "stream";

interface SandwichStreamInstance {
  currentStream: Readable;
  push(chunk: unknown): boolean;
}

/**
 * Telegraf 4.x builds multipart uploads with `sandwich-stream`, which calls
 * `read()` only once per 'readable' event. Since Node 26, `read()` returns
 * just the first buffered chunk (not the whole buffer), so the rest is never
 * read, 'end' never fires and every file upload hangs until Telegram drops
 * the connection ("socket hang up"). Reading until null works on all versions.
 */
const patchSandwichStream = (): void => {
  // Resolve from telegraf's folder: patch the very copy telegraf uses
  const telegrafDir = path.dirname(require.resolve("telegraf"));
  const modulePath = require.resolve("sandwich-stream", {
    paths: [telegrafDir],
  });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SandwichStream } = require(modulePath) as {
    SandwichStream?: { prototype: Record<string, unknown> };
  };

  if (typeof SandwichStream?.prototype.currentStreamOnReadable !== "function") {
    throw new Error("sandwich-stream changed, the upload patch can't be applied");
  }

  SandwichStream.prototype.currentStreamOnReadable = function (
    this: SandwichStreamInstance,
  ): void {
    let chunk: unknown;
    while ((chunk = this.currentStream.read()) !== null) {
      this.push(chunk);
    }
  };
};

patchSandwichStream();

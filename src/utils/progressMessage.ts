import { formatFileSize } from "@/helpers/formatFileSize";
import { IMyContext } from "@/interfaces/IMyContext";
import { IDownloadProgress } from "@/utils/ytdlpProgress";
import { Cancellable, registerCancellable } from "@/utils/downloadCancel";

// Telegram rate-limits message edits, a few seconds apart is safe
const EDIT_INTERVAL_MS = 3000;
const BAR_LENGTH = 10;

const formatEta = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};

export const formatProgress = (
  title: string,
  progress: IDownloadProgress,
): string => {
  const lines = [title, ""];
  const { downloaded, total, speed, eta } = progress;

  if (total && total > 0) {
    const percent = Math.min(100, Math.floor((downloaded / total) * 100));
    const filled = Math.round((percent / 100) * BAR_LENGTH);
    lines.push(`${"▰".repeat(filled)}${"▱".repeat(BAR_LENGTH - filled)} ${percent}%`);
    lines.push(`${formatFileSize(downloaded)} / ${formatFileSize(total)}`);
  } else {
    lines.push(`${formatFileSize(downloaded)} yuklandi`);
  }

  const stats: string[] = [];
  if (speed) stats.push(`⚡ ${formatFileSize(speed)}/s`);
  if (eta !== undefined) stats.push(`⏳ ${formatEta(eta)} qoldi`);
  if (stats.length > 0) lines.push(stats.join(" · "));

  return lines.join("\n");
};

/**
 * A status message that shows download progress, with a ❌ button that
 * aborts `signal`.
 * Edits are chained, so they reach Telegram in order and a late progress
 * update can never overwrite a later status.
 */
export class ProgressMessage {
  private chain: Promise<void> = Promise.resolve();
  private lastEditAt = Date.now();
  private lastText: string;
  private finished = false;

  private constructor(
    private readonly ctx: IMyContext,
    private readonly chatId: number,
    private readonly messageId: number,
    private readonly title: string,
    private readonly cancellable: Cancellable,
  ) {
    this.lastText = title;
  }

  static async send(ctx: IMyContext, title: string): Promise<ProgressMessage> {
    const cancellable = registerCancellable(ctx.from?.id);
    try {
      const message = await ctx.sendMessage(title, {
        reply_markup: cancellable.keyboard,
      });
      return new ProgressMessage(
        ctx,
        message.chat.id,
        message.message_id,
        title,
        cancellable,
      );
    } catch (error) {
      cancellable.unregister();
      throw error;
    }
  }

  /**
   * Aborted when the user presses ❌, pass it to the download
   */
  get signal(): AbortSignal {
    return this.cancellable.signal;
  }

  /**
   * Progress callback, throttled; safe to call on every yt-dlp line
   */
  update = (progress: IDownloadProgress): void => {
    if (this.finished) return;

    const now = Date.now();
    if (now - this.lastEditAt < EDIT_INTERVAL_MS) return;

    const text = formatProgress(this.title, progress);
    if (text === this.lastText) return;

    this.lastEditAt = now;
    this.edit(text, true);
  };

  /**
   * Replaces the text, removes the ❌ button and stops progress updates
   */
  async setText(text: string): Promise<void> {
    this.finish();
    this.edit(text, false);
    await this.chain;
  }

  async delete(): Promise<void> {
    this.finish();
    await this.chain;
    await this.ctx.telegram
      .deleteMessage(this.chatId, this.messageId)
      .catch(() => {});
  }

  private finish(): void {
    this.finished = true;
    this.cancellable.unregister();
  }

  private edit(text: string, withCancelButton: boolean): void {
    this.lastText = text;
    this.chain = this.chain
      .then(() =>
        this.ctx.telegram.editMessageText(
          this.chatId,
          this.messageId,
          undefined,
          text,
          withCancelButton ? { reply_markup: this.cancellable.keyboard } : {},
        ),
      )
      .then(
        () => {},
        () => {}, // "message is not modified" etc. are harmless
      );
  }
}

import { IMyContext } from "@/interfaces/IMyContext";

// Telegram caption limit is 1024, leave room for the bot mention
const MAX_TITLE_LENGTH = 900;

/**
 * "🎬 Title" + "📥 @bot" — the mention travels with every forwarded file
 */
export const buildCaption = (
  ctx: IMyContext,
  title?: string | null,
  emoji = "🎬",
): string | undefined => {
  const lines: string[] = [];
  const trimmedTitle = title?.trim();
  if (trimmedTitle) {
    lines.push(`${emoji} ${trimmedTitle.substring(0, MAX_TITLE_LENGTH)}`);
  }

  const username = ctx.botInfo?.username;
  if (username) lines.push(`📥 @${username}`);

  return lines.length > 0 ? lines.join("\n\n") : undefined;
};

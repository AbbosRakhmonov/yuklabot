import { IMyContext } from "@/interfaces/IMyContext";
import { sendTiktokPost } from "@/scenes/tiktok/helpers/sendTiktokMedia";

/**
 * Most people want the video, so it's sent right away;
 * the audio is one tap away via the button under it.
 * Photo posts are sent as albums together with their music.
 */
export const tiktokStep1 = async (ctx: IMyContext) => {
  await sendTiktokPost(ctx, ctx.wizard.state.tiktok.url);
  return ctx.scene.leave();
};

import { TYoutubeSceneContext } from "@/scenes/youtube/types/TYoutubeSceneContext";
import { sendAudioVideoButtons } from "@/utils/sendAudioVideoButtons";

export const youtubeStep1 = async (ctx: TYoutubeSceneContext) => {
  await sendAudioVideoButtons(ctx);

  return ctx.wizard.next();
};

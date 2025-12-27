import { IMyContext } from "@/interfaces/IMyContext";
import { sendAudioVideoButtons } from "@/utils/sendAudioVideoButtons";

export const youtubeStep1 = async (ctx: IMyContext) => {
  await sendAudioVideoButtons(ctx);

  return ctx.wizard.next();
};

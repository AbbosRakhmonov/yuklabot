import { MESSAGES } from "@/constants";
import { TYoutubeSceneContext } from "../types/TYoutubeSceneContext";
import { callbackQuery } from "telegraf/filters";
import fs from "fs";
import path from "path";
import { config } from "@/config/config";
import { Input } from "telegraf";
import { startContinuousAction } from "@/utils/continuousAction";
import { IMyContext } from "@/interfaces/IMyContext";
import { CANCEL_BUTTON_CALLBACK } from "@/scenes/youtube/constants";

export const youtubeStep3 = async (ctx: TYoutubeSceneContext) => {
  await ctx.answerCbQuery();

  if (ctx.has(callbackQuery("data"))) {
    const data = ctx.callbackQuery.data;

    // Handle cancel button
    if (data === CANCEL_BUTTON_CALLBACK) {
      await ctx.editMessageText(MESSAGES.INFO.SCENE_CANCELLED);
      return ctx.scene.leave();
    }

    const height = data;
    await ctx.deleteMessage();
    const message = await ctx.sendMessage(MESSAGES.INFO.DOWNLOADING_VIDEO);
    const folderName = await ctx.scene.session.service.downloadVideo(height);
    startContinuousAction(ctx as IMyContext, "upload_video");
    // get first file in folder
    const filePath = path.join(
      config.downloadDir,
      folderName,
      fs.readdirSync(path.join(config.downloadDir, folderName))[0]
    );
    await ctx.deleteMessage(message.message_id);
    const videoStream = fs.createReadStream(filePath);
    await ctx.replyWithVideo(Input.fromReadableStream(videoStream));
    // delete the folder inside config.downloadDir
    fs.rmSync(path.join(config.downloadDir, folderName), { recursive: true });
  }

  return ctx.scene.leave();
};

import { MESSAGES } from "@/constants";
import { callbackQuery } from "telegraf/filters";
import fs from "fs";
import path from "path";
import { config } from "@/config/config";
import { Input } from "telegraf";
import { startContinuousAction } from "@/utils/continuousAction";
import { IMyContext } from "@/interfaces/IMyContext";
import { handleCancelButton } from "@/scenes/helpers";
import YoutubeDownload from "@/models/YoutubeDownload";
import { EPlatform } from "@/enums/EPlatform";
import { EMediaType } from "@/enums/EMediaType";
import { findAndSendMedia } from "@/helpers";

export const youtubeStep3 = async (ctx: IMyContext) => {
  if (ctx.has(callbackQuery("data"))) {
    await ctx.answerCbQuery();

    const data = ctx.callbackQuery.data;

    await handleCancelButton(ctx, data);

    const height = data;

    await ctx.deleteMessage();

    const result = await findAndSendMedia(ctx, YoutubeDownload, {
      user: ctx.userMongoId,
      url: ctx.wizard.state.service.url,
      platform: EPlatform.YOUTUBE,
      height: Number(height),
      mediaType: EMediaType.VIDEO,
    });

    if (!result) {
      const message = await ctx.sendMessage(MESSAGES.INFO.DOWNLOADING_VIDEO);
      const folderName = await ctx.wizard.state.service.downloadVideo(height);
      startContinuousAction(ctx as IMyContext, "upload_video");
      // get first file in folder
      const filePath = path.join(
        config.downloadDir,
        folderName,
        fs.readdirSync(path.join(config.downloadDir, folderName))[0]
      );
      await ctx.deleteMessage(message.message_id);
      const videoStream = fs.createReadStream(filePath);
      const sentMessage = await ctx.replyWithVideo(
        Input.fromReadableStream(videoStream)
      );
      const fileName = path.basename(filePath);
      const fileSize = fs.statSync(filePath).size;
      // delete the folder inside config.downloadDir
      fs.rmSync(path.join(config.downloadDir, folderName), { recursive: true });

      // Create YoutubeDownload record
      if (ctx.userMongoId) {
        await YoutubeDownload.create({
          user: ctx.userMongoId,
          url: ctx.wizard.state.service.url,
          chatId: ctx.chat?.id || ctx.from?.id || 0,
          messageId: sentMessage.message_id,
          platform: EPlatform.YOUTUBE,
          fileName: fileName,
          fileSize: fileSize,
          mediaType: EMediaType.VIDEO,
          height: Number(height),
        });
      }
    }
  }

  return ctx.scene.leave();
};

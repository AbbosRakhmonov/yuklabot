import { MESSAGES } from "@/constants";
import { TYoutubeSceneContext } from "../types/TYoutubeSceneContext";
import fs from "fs";
import path from "path";
import { config } from "@/config/config";
import { Input } from "telegraf";

export const youtubeStep4 = async (ctx: TYoutubeSceneContext) => {
  const message = await ctx.sendMessage(MESSAGES.INFO.DOWNLOADING_AUDIO);
  const folderName = await ctx.scene.session.service.downloadAudio();
  const filePath = path.join(
    config.downloadDir,
    folderName,
    fs.readdirSync(path.join(config.downloadDir, folderName))[0]
  );
  await ctx.deleteMessage(message.message_id);
  const audioStream = fs.createReadStream(filePath);
  await ctx.replyWithAudio(Input.fromReadableStream(audioStream));
  // delete the folder inside config.downloadDir
  fs.rmSync(path.join(config.downloadDir, folderName), { recursive: true });
  return ctx.scene.leave();
};

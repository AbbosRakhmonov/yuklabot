import { TIKTOK_SCENE_NAME } from "@/scenes/tiktok/constants";
import { tiktokStep1 } from "@/scenes/tiktok/steps/tiktok_step_1";
import { Scenes } from "telegraf";
import { IMyContext } from "@/interfaces/IMyContext";

/**
 * TikTok Downloader Scene
 * Sends the video (without watermark) right away, with an audio button
 */
export const tiktokScene = new Scenes.WizardScene<IMyContext>(
  TIKTOK_SCENE_NAME,
  tiktokStep1
);

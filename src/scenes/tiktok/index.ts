import { TIKTOK_SCENE_NAME } from "@/scenes/tiktok/constants";
import { tiktokStep1 } from "@/scenes/tiktok/steps/tiktok_step_1";
import { tiktokStep2 } from "@/scenes/tiktok/steps/tiktok_step_2";
import { Scenes } from "telegraf";
import { IMyContext } from "@/interfaces/IMyContext";

/**
 * TikTok Downloader Scene
 * Handles the download flow for TikTok URLs (without watermark)
 */
export const tiktokScene = new Scenes.WizardScene<IMyContext>(
  TIKTOK_SCENE_NAME,
  tiktokStep1,
  tiktokStep2
);

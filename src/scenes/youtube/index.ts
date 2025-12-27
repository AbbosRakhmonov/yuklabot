import { YOUTUBE_SCENE_NAME } from "@/scenes/youtube/constants";
import { youtubeStep1 } from "@/scenes/youtube/steps/youtube_step_1";
import { youtubeStep2 } from "@/scenes/youtube/steps/youtube_step_2";
import { youtubeStep3 } from "@/scenes/youtube/steps/youtube_step_3";
import { youtubeStep4 } from "@/scenes/youtube/steps/youtube_step_4";
import { Scenes } from "telegraf";
import { IMyContext } from "@/interfaces/IMyContext";

/**
 * YouTube Downloader Scene
 * Handles the download flow for YouTube URLs
 */
export const youtubeScene = new Scenes.WizardScene<IMyContext>(
  YOUTUBE_SCENE_NAME,
  youtubeStep1,
  youtubeStep2,
  youtubeStep3,
  youtubeStep4
);

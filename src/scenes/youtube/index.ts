import { YOUTUBE_SCENE_NAME } from "@/scenes/youtube/constants";
import { youtubeStep1 } from "@/scenes/youtube/steps/youtube_step_1";
import { youtubeStep2 } from "@/scenes/youtube/steps/youtube_step_2";
import { youtubeStep3 } from "@/scenes/youtube/steps/youtube_step_3";
import { Scenes } from "telegraf";
import { IMyContext } from "@/interfaces/IMyContext";

/**
 * YouTube Downloader Scene
 * 1. Video or audio  2. Quality menu  3. Download and send the chosen quality
 */
export const youtubeScene = new Scenes.WizardScene<IMyContext>(
  YOUTUBE_SCENE_NAME,
  youtubeStep1,
  youtubeStep2,
  youtubeStep3
);

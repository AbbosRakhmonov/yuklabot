import { YOUTUBE_SCENE_NAME } from "@/scenes/youtube/constants";
import { TYoutubeSceneContext } from "@/scenes/youtube/types/TYoutubeSceneContext";
import { youtubeStep1 } from "@/scenes/youtube/steps/youtube_step_1";
import { youtubeStep2 } from "@/scenes/youtube/steps/youtube_step_2";
import { Scenes } from "telegraf";

/**
 * YouTube Downloader Scene
 * Handles the download flow for YouTube URLs
 */
export const youtubeScene = new Scenes.WizardScene<TYoutubeSceneContext>(
  YOUTUBE_SCENE_NAME,
  youtubeStep1,
  youtubeStep2
);

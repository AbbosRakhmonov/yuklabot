import { INSTAGRAM_SCENE_NAME } from "@/scenes/instagram/constants";
import { instagramStep1 } from "@/scenes/instagram/steps/instagram_step_1";
import { instagramStep2 } from "@/scenes/instagram/steps/instagram_step_2";
import { instagramStep3 } from "@/scenes/instagram/steps/instagram_step_3";
import { instagramStep4 } from "@/scenes/instagram/steps/instagram_step_4";
import { instagramStep5 } from "@/scenes/instagram/steps/instagram_step_5";
import { instagramStep6 } from "@/scenes/instagram/steps/instagram_step_6";
import { Scenes } from "telegraf";
import { IMyContext } from "@/interfaces/IMyContext";

/**
 * Instagram Downloader Scene
 * Handles the download flow for Instagram URLs
 */
export const instagramScene = new Scenes.WizardScene<IMyContext>(
  INSTAGRAM_SCENE_NAME,
  instagramStep1,
  instagramStep2,
  instagramStep3,
  instagramStep4,
  instagramStep5,
  instagramStep6
);

// src/interfaces/IMyContext.ts
import { IYouTubeState } from "@/scenes/youtube/interfaces/IYoutubeState";
import { IInstagramState } from "@/scenes/instagram/interfaces/IInstagramState";
import { ITiktokState } from "@/scenes/tiktok/interfaces/ITiktokState";
import mongoose from "mongoose";
import { Context, Scenes } from "telegraf";

export interface IMyContext extends Context {
  session: Scenes.WizardSession;
  scene: Scenes.SceneContextScene<IMyContext, Scenes.WizardSessionData>;
  wizard: Scenes.WizardContextWizard<IMyContext> & {
    state: {
      youtube: IYouTubeState;
      instagram: IInstagramState;
      tiktok: ITiktokState;
    };
  };
  userMongoId?: mongoose.Types.ObjectId; // MongoDB _id of the user document
}

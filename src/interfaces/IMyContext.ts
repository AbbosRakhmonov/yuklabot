import { IYouTubeState } from "@/scenes/youtube/interfaces/IYoutubeState";
import mongoose from "mongoose";
import { Context, Scenes } from "telegraf";

type DownloadWizardState = IYouTubeState;

export interface IMyContext extends Context {
  session: Scenes.WizardSession;
  scene: Scenes.SceneContextScene<IMyContext, Scenes.WizardSessionData>;
  wizard: Scenes.WizardContextWizard<IMyContext> & {
    state: DownloadWizardState;
  };
  userMongoId?: mongoose.Types.ObjectId; // MongoDB _id of the user document
}

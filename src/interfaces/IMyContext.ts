import { YouTubeSceneSession } from "@/scenes/youtube/interfaces/IYoutubeSceneSession";
import { Scenes } from "telegraf";

type AllSessions = YouTubeSceneSession;

export type IMyContext = Scenes.WizardContext<AllSessions> & {
  session: {
    __scenes: AllSessions;
  };
};

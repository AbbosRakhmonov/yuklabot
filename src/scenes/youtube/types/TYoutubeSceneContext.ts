import { YouTubeSceneSession } from "@/scenes/youtube/interfaces/IYoutubeSceneSession";
import { Scenes } from "telegraf";

export type TYoutubeSceneContext = Scenes.WizardContext<YouTubeSceneSession>;

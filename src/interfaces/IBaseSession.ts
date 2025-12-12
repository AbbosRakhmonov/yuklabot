import { Scenes } from "telegraf";

export interface IBaseSession extends Scenes.WizardSessionData {
  url: string;
}

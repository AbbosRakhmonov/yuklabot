import { Schema } from "mongoose";
import { IYoutubeDownload } from "@/interfaces/IYoutubeDownload";
import { EPlatform } from "@/enums/EPlatform";
import DownloadModel from "./Download";

// YouTube-specific fields schema
const YoutubeDownloadSchema: Schema = new Schema<IYoutubeDownload>({
  height: {
    type: Number,
    required: true,
  },
});

export default DownloadModel.discriminator<IYoutubeDownload>(
  EPlatform.YOUTUBE,
  YoutubeDownloadSchema
);

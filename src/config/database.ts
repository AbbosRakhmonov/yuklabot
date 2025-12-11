import mongoose from "mongoose";
import logger from "./logger";

export const connectDatabase = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
      throw new Error("MONGODB_URI is not defined in environment variables");
    }

    await mongoose.connect(mongoUri);
    logger.info("✅ Connected to MongoDB");
  } catch (error) {
    logger.error("❌ MongoDB connection error", { error });
    process.exit(1);
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    logger.info("✅ Disconnected from MongoDB");
  } catch (error) {
    logger.error("❌ MongoDB disconnection error", { error });
  }
};

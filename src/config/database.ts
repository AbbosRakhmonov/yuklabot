import mongoose from "mongoose";
import logger from "./logger";
import { Mongo } from "@telegraf/session/mongodb";
import type { SessionStore } from "telegraf";
import { WizardSession, WizardSessionData } from "telegraf/typings/scenes";

export const connectDatabase = async (): Promise<
  SessionStore<WizardSession<WizardSessionData>>
> => {
  try {
    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
      throw new Error("MONGODB_URI is not defined in environment variables");
    }

    await mongoose.connect(mongoUri);
    logger.info("✅ Connected to MongoDB");

    // Get MongoDB client from mongoose connection
    const client = mongoose.connection.getClient();

    // Get database name from connection
    const dbName = mongoose.connection.db?.databaseName || "yuklabot";

    // Create and return MongoDB session store
    const store = Mongo<WizardSession<WizardSessionData>>({
      client,
      database: dbName, 
    });

    logger.info("✅ MongoDB session store created");
    return store;
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

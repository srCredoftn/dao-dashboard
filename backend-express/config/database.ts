import mongoose from "mongoose";
import { logger } from "../utils/logger.js";

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/dao-management";

export async function connectToDatabase() {
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI);
      logger.info("✅ Connected to MongoDB", "DATABASE");
    }
    return mongoose.connection;
  } catch (error) {
    logger.error("❌ MongoDB connection error", "DATABASE", error);
    throw error;
  }
}

export async function disconnectFromDatabase() {
  try {
    await mongoose.disconnect();
    logger.info("🔌 Disconnected from MongoDB", "DATABASE");
  } catch (error) {
    logger.error("❌ MongoDB disconnection error", "DATABASE", error);
    throw error;
  }
}

// Handle connection events
mongoose.connection.on("connected", () => {
  logger.info("🟢 Mongoose connected to MongoDB", "DATABASE");
});

mongoose.connection.on("error", (err) => {
  logger.error("🔴 Mongoose connection error", "DATABASE", err);
});

mongoose.connection.on("disconnected", () => {
  logger.info("🟡 Mongoose disconnected from MongoDB", "DATABASE");
});

// Graceful shutdown
process.on("SIGINT", async () => {
  await disconnectFromDatabase();
  process.exit(0);
});

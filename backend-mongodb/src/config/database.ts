import mongoose from "mongoose";
import { UserModel } from "../models/User.js";

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/dao-management";

export const connectDB = async (): Promise<void> => {
  try {
    console.log("🔌 Connecting to MongoDB...");

    await mongoose.connect(MONGODB_URI);

    console.log("✅ MongoDB connected successfully");
    console.log(`📊 Database: ${mongoose.connection.name}`);

    // Initialize default admin user if none exists
    await initializeDefaultUsers();
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
};

// Initialize default users if database is empty
const initializeDefaultUsers = async (): Promise<void> => {
  try {
    const userCount = await UserModel.countDocuments();

    if (userCount === 0) {
      console.log("🔧 Initializing default users...");

      // Create default admin user
      const adminUser = new UserModel({
        name: "Admin User",
        email: "admin@2snd.fr",
        password: "admin123",
        role: "admin",
      });

      // Create default regular users
      const regularUsers = [
        {
          name: "Marie Dubois",
          email: "marie.dubois@2snd.fr",
          password: "marie123",
          role: "user" as const,
        },
        {
          name: "Pierre Martin",
          email: "pierre.martin@2snd.fr",
          password: "pierre123",
          role: "user" as const,
        },
        {
          name: "Credo FONTON",
          email: "fontoncredo@gmail.com",
          password: "W@l7t8WkaCYm",
          role: "user" as const,
        },
      ];

      await adminUser.save();
      console.log(`👑 Admin user created: ${adminUser.email}`);

      for (const userData of regularUsers) {
        const user = new UserModel(userData);
        await user.save();
        console.log(`👤 User created: ${user.email}`);
      }

      console.log("✅ Default users initialized");
    } else {
      console.log(`👥 Found ${userCount} existing users`);
    }
  } catch (error) {
    console.error("❌ Error initializing default users:", error);
  }
};

// Handle connection events
mongoose.connection.on("connected", () => {
  console.log("🔗 Mongoose connected to MongoDB");
});

mongoose.connection.on("error", (err) => {
  console.error("❌ Mongoose connection error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.log("🔌 Mongoose disconnected from MongoDB");
});

// Handle process termination
process.on("SIGINT", async () => {
  try {
    await mongoose.connection.close();
    console.log("🔚 MongoDB connection closed through app termination");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error closing MongoDB connection:", error);
    process.exit(1);
  }
});

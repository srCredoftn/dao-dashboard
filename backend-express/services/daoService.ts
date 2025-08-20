import DaoModel from "../models/Dao";
import { connectToDatabase } from "../config/database";
import type { Dao } from "@shared/dao";

export class DaoService {
  private static async ensureConnection() {
    await connectToDatabase();
  }

  // Get all DAOs
  static async getAllDaos(): Promise<Dao[]> {
    await this.ensureConnection();
    try {
      const daos = await DaoModel.find().sort({ updatedAt: -1 });
      return daos.map((dao) => dao.toObject());
    } catch (error) {
      console.error("Error fetching DAOs:", error);
      throw new Error("Failed to fetch DAOs");
    }
  }

  // Get DAO by ID
  static async getDaoById(id: string): Promise<Dao | null> {
    await this.ensureConnection();
    try {
      const dao = await DaoModel.findOne({ id });
      return dao ? dao.toObject() : null;
    } catch (error) {
      console.error("Error fetching DAO by ID:", error);
      throw new Error("Failed to fetch DAO");
    }
  }

  // Generate next DAO number
  static async generateNextDaoNumber(): Promise<string> {
    await this.ensureConnection();
    try {
      const year = new Date().getFullYear();

      // Find all DAOs for current year
      const existingDaos = await DaoModel.find({
        numeroListe: { $regex: `^DAO-${year}-` },
      }).sort({ numeroListe: -1 });

      if (existingDaos.length === 0) {
        return `DAO-${year}-001`;
      }

      // Extract numbers and find the highest
      const numbers = existingDaos
        .map((dao) => {
          const match = dao.numeroListe.match(/DAO-\d{4}-(\d{3})/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter((num) => !isNaN(num));

      const nextNumber = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
      return `DAO-${year}-${nextNumber.toString().padStart(3, "0")}`;
    } catch (error) {
      console.error("Error generating DAO number:", error);
      throw new Error("Failed to generate DAO number");
    }
  }

  // Create new DAO
  static async createDao(
    daoData: Omit<Dao, "id" | "createdAt" | "updatedAt">,
  ): Promise<Dao> {
    await this.ensureConnection();
    try {
      const id = Date.now().toString();
      const now = new Date().toISOString();

      // Generate the next DAO number if not provided or if it's the default
      let numeroListe = daoData.numeroListe;
      if (!numeroListe || numeroListe.includes("001")) {
        numeroListe = await this.generateNextDaoNumber();
      }

      const dao = new DaoModel({
        ...daoData,
        numeroListe,
        id,
        createdAt: now,
        updatedAt: now,
      });

      const savedDao = await dao.save();
      return savedDao.toObject();
    } catch (error) {
      console.error("Error creating DAO:", error);
      throw new Error("Failed to create DAO");
    }
  }

  // Update DAO
  static async updateDao(
    id: string,
    updates: Partial<Dao>,
  ): Promise<Dao | null> {
    await this.ensureConnection();
    try {
      const updatedDao = await DaoModel.findOneAndUpdate(
        { id },
        {
          ...updates,
          updatedAt: new Date().toISOString(),
        },
        { new: true },
      );
      return updatedDao ? updatedDao.toObject() : null;
    } catch (error) {
      console.error("Error updating DAO:", error);
      throw new Error("Failed to update DAO");
    }
  }

  // Delete DAO
  static async deleteDao(id: string): Promise<boolean> {
    await this.ensureConnection();
    try {
      const result = await DaoModel.deleteOne({ id });
      return result.deletedCount > 0;
    } catch (error) {
      console.error("Error deleting DAO:", error);
      throw new Error("Failed to delete DAO");
    }
  }

  // Initialize with sample data if empty
  static async initializeSampleData(sampleDaos: Dao[]): Promise<void> {
    await this.ensureConnection();
    try {
      const count = await DaoModel.countDocuments();
      if (count === 0) {
        console.log("🌱 Initializing database with sample data...");
        await DaoModel.insertMany(sampleDaos);
        console.log("✅ Sample data initialized");
      }
    } catch (error) {
      console.error("Error initializing sample data:", error);
      throw new Error("Failed to initialize sample data");
    }
  }
}

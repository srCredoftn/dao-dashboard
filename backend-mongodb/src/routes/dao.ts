import express from "express";
import { z } from "zod";
import { DaoModel } from "../models/Dao.js";
import { authenticate, requireUser, requireAdmin } from "../middleware/auth.js";
import { DEFAULT_TASKS } from "@shared/dao.js";
import type { Dao, TeamMember, DaoTask } from "@shared/dao.js";

const router = express.Router();

// Validation schemas
const teamMemberSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  role: z.enum(["chef_equipe", "membre_equipe"]),
  email: z.string().email().optional(),
});

const taskSchema = z.object({
  id: z.number(),
  name: z.string().min(1),
  progress: z.number().min(0).max(100).nullable(),
  comment: z.string().optional(),
  isApplicable: z.boolean(),
  assignedTo: z.string().optional(),
  lastUpdatedBy: z.string().optional(),
  lastUpdatedAt: z.string().optional(),
});

const createDaoSchema = z.object({
  numeroListe: z.string().min(1).max(50),
  objetDossier: z.string().min(1).max(500),
  reference: z.string().min(1).max(200),
  autoriteContractante: z.string().min(1).max(200),
  dateDepot: z
    .string()
    .refine((date) => !isNaN(Date.parse(date)), "Invalid date format"),
  equipe: z.array(teamMemberSchema).min(1),
  tasks: z.array(taskSchema).optional(),
});

const updateDaoSchema = createDaoSchema.partial();

// GET /api/dao - Get all DAOs (authenticated users only)
router.get("/", authenticate, async (req, res) => {
  try {
    const daos = await DaoModel.find().sort({ createdAt: -1 }).exec();

    console.log(`📊 Serving ${daos.length} DAOs from MongoDB`);
    res.json(daos);
  } catch (error) {
    console.error("Error in GET /api/dao:", error);
    res.status(500).json({ error: "Failed to fetch DAOs" });
  }
});

// GET /api/dao/next-number - Get next DAO number (authenticated users only)
router.get("/next-number", authenticate, async (req, res) => {
  try {
    const year = new Date().getFullYear();

    // Find DAOs for current year
    const currentYearDaos = await DaoModel.find({
      numeroListe: new RegExp(`^DAO-${year}-\\d{3}$`),
    });

    if (currentYearDaos.length === 0) {
      return res.json({ nextNumber: `DAO-${year}-001` });
    }

    // Extract numbers and find the highest
    const numbers = currentYearDaos
      .map((dao) => {
        const match = dao.numeroListe.match(/DAO-\d{4}-(\d{3})/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((num) => !isNaN(num));

    const nextNumber = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
    const nextNumberString = `DAO-${year}-${nextNumber.toString().padStart(3, "0")}`;

    console.log("🔢 Generated next DAO number:", nextNumberString);
    res.json({ nextNumber: nextNumberString });
  } catch (error) {
    console.error("Error in GET /api/dao/next-number:", error);
    res.status(500).json({ error: "Failed to generate next DAO number" });
  }
});

// GET /api/dao/:id - Get DAO by ID (authenticated users only)
router.get("/:id", authenticate, async (req, res) => {
  try {
    const dao = await DaoModel.findById(req.params.id);

    if (!dao) {
      return res.status(404).json({ error: "DAO not found" });
    }

    console.log("📄 Serving DAO by ID:", req.params.id);
    res.json(dao);
  } catch (error) {
    console.error("Error in GET /api/dao/:id:", error);
    res.status(500).json({ error: "Failed to fetch DAO" });
  }
});

// POST /api/dao - Create new DAO (admin only)
router.post("/", authenticate, requireAdmin, async (req, res) => {
  try {
    const validatedData = createDaoSchema.parse(req.body);

    // Check if numeroListe already exists
    const existingDao = await DaoModel.findOne({
      numeroListe: validatedData.numeroListe,
    });

    if (existingDao) {
      return res.status(400).json({
        error: "DAO number already exists",
      });
    }

    // Use provided tasks or default tasks
    const tasks =
      validatedData.tasks ||
      DEFAULT_TASKS.map((task) => ({
        ...task,
        progress: null,
        comment: "",
      }));

    const newDao = new DaoModel({
      ...validatedData,
      tasks,
    });

    await newDao.save();

    console.log("✨ Created new DAO:", newDao.numeroListe);
    res.status(201).json(newDao);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors,
      });
    }

    console.error("Error in POST /api/dao:", error);
    res.status(500).json({ error: "Failed to create DAO" });
  }
});

// PUT /api/dao/:id - Update DAO (users and admins)
router.put("/:id", authenticate, requireUser, async (req, res) => {
  try {
    const validatedData = updateDaoSchema.parse(req.body);

    const dao = await DaoModel.findById(req.params.id);
    if (!dao) {
      return res.status(404).json({ error: "DAO not found" });
    }

    // Check for numeroListe uniqueness if being updated
    if (
      validatedData.numeroListe &&
      validatedData.numeroListe !== dao.numeroListe
    ) {
      const existingDao = await DaoModel.findOne({
        numeroListe: validatedData.numeroListe,
        _id: { $ne: req.params.id },
      });

      if (existingDao) {
        return res.status(400).json({
          error: "DAO number already exists",
        });
      }
    }

    // Update fields
    Object.assign(dao, validatedData);
    dao.updatedAt = new Date().toISOString();

    await dao.save();

    console.log("📝 Updated DAO:", req.params.id);
    res.json(dao);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors,
      });
    }

    console.error("Error in PUT /api/dao/:id:", error);
    res.status(500).json({ error: "Failed to update DAO" });
  }
});

// DELETE /api/dao/:id - Delete DAO (admin only)
router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const dao = await DaoModel.findById(req.params.id);

    if (!dao) {
      return res.status(404).json({ error: "DAO not found" });
    }

    await DaoModel.findByIdAndDelete(req.params.id);

    console.log("🗑️ Deleted DAO:", req.params.id);
    res.json({ message: "DAO deleted successfully" });
  } catch (error) {
    console.error("Error in DELETE /api/dao/:id:", error);
    res.status(500).json({ error: "Failed to delete DAO" });
  }
});

// PUT /api/dao/:id/tasks/:taskId - Update specific task
router.put(
  "/:id/tasks/:taskId",
  authenticate,
  requireUser,
  async (req, res) => {
    try {
      const { progress, comment, isApplicable, assignedTo } = req.body;
      const taskId = parseInt(req.params.taskId);

      if (isNaN(taskId)) {
        return res.status(400).json({ error: "Invalid task ID" });
      }

      const dao = await DaoModel.findById(req.params.id);
      if (!dao) {
        return res.status(404).json({ error: "DAO not found" });
      }

      const task = dao.tasks.find((t) => t.id === taskId);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      // Update task fields
      if (typeof progress === "number") {
        task.progress = Math.max(0, Math.min(100, progress));
      }
      if (typeof comment === "string") {
        task.comment = comment;
      }
      if (typeof isApplicable === "boolean") {
        task.isApplicable = isApplicable;
      }
      if (typeof assignedTo === "string") {
        task.assignedTo = assignedTo;
      }

      task.lastUpdatedBy = req.user!.id;
      task.lastUpdatedAt = new Date().toISOString();

      await dao.save();

      console.log(`📋 Updated task ${taskId} in DAO ${req.params.id}`);
      res.json(dao);
    } catch (error) {
      console.error("Error in PUT /api/dao/:id/tasks/:taskId:", error);
      res.status(500).json({ error: "Failed to update task" });
    }
  },
);

export default router;

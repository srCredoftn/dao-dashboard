import express from "express";
import { z } from "zod";
import { daoStorage } from "../data/daoStorage";
import {
  authenticate,
  requireUser,
  requireAdmin,
  auditLog,
  sensitiveOperationLimit,
} from "../middleware/auth";
import { devLog, apiLog } from "../utils/devLog";
import { DEFAULT_TASKS } from "@shared/dao";
import type { Dao } from "@shared/dao";

const router = express.Router();

// Validation schemas
const teamMemberSchema = z.object({
  id: z.string().min(1).max(50),
  name: z.string().min(1).max(100).trim(),
  role: z.enum(["chef_equipe", "membre_equipe"]),
  email: z.string().email().optional(),
});

const taskSchema = z.object({
  id: z.number().int().min(1),
  name: z.string().min(1).max(200).trim(),
  progress: z.number().min(0).max(100).nullable(),
  comment: z.string().max(1000).optional(),
  isApplicable: z.boolean(),
  assignedTo: z.string().max(50).optional(),
  lastUpdatedBy: z.string().max(50).optional(),
  lastUpdatedAt: z.string().optional(),
});

const createDaoSchema = z.object({
  numeroListe: z.string().min(1).max(50).trim(),
  objetDossier: z.string().min(1).max(500).trim(),
  reference: z.string().min(1).max(200).trim(),
  autoriteContractante: z.string().min(1).max(200).trim(),
  dateDepot: z
    .string()
    .refine((date) => !isNaN(Date.parse(date)), "Invalid date format"),
  equipe: z.array(teamMemberSchema).min(1).max(20),
  tasks: z.array(taskSchema).max(50).optional(),
});

const updateDaoSchema = createDaoSchema.partial();

const taskUpdateSchema = z.object({
  progress: z.number().min(0).max(100).optional(),
  comment: z.string().max(1000).optional(),
  isApplicable: z.boolean().optional(),
  assignedTo: z.string().max(50).optional(),
});

// Using shared DAO storage service

// Helper to generate new ID securely
function generateId(): string {
  return `dao_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

// Input sanitization
function sanitizeString(input: string): string {
  return input.replace(/<[^>]*>/g, "").trim(); // Remove HTML tags
}

// GET /api/dao - Get all DAOs (authenticated users only)
router.get("/", authenticate, auditLog("VIEW_ALL_DAOS"), (req, res) => {
  try {
    // Filter sensitive data based on user role
    let filteredDaos = daoStorage.getAll();

    if (req.user?.role !== "admin") {
      // Non-admin users might see limited data in the future
      filteredDaos = daoStorage.getAll(); // For now, all users see all DAOs
    }

    apiLog.response(
      `Serving ${filteredDaos.length} DAOs to ${req.user?.email} (${req.user?.role})`,
      "GET",
      "/api/dao",
    );
    res.json(filteredDaos);
  } catch (error) {
    devLog.error("Error in GET /api/dao:", error);
    res.status(500).json({
      error: "Failed to fetch DAOs",
      code: "FETCH_ERROR",
    });
  }
});

// GET /api/dao/next-number - Get next DAO number (authenticated users only)
router.get("/next-number", authenticate, (req, res) => {
  try {
    const year = new Date().getFullYear();

    // Validate year is reasonable
    if (year < 2020 || year > 2100) {
      return res.status(400).json({
        error: "Invalid year",
        code: "INVALID_YEAR",
      });
    }

    // Filter DAOs for current year with safer regex
    const currentYearDaos = daoStorage.filter((dao) => {
      const match = dao.numeroListe.match(/^DAO-(\d{4})-(\d{3})$/);
      return Boolean(match && parseInt(match[1], 10) === year);
    });

    if (currentYearDaos.length === 0) {
      return res.json({ nextNumber: `DAO-${year}-001` });
    }

    // Extract numbers safely
    const numbers = currentYearDaos
      .map((dao) => {
        const match = dao.numeroListe.match(/^DAO-\d{4}-(\d{3})$/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((num) => !isNaN(num) && num > 0);

    const nextNumber = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;

    // Validate next number is reasonable
    if (nextNumber > 999) {
      return res.status(400).json({
        error: "Too many DAOs for this year",
        code: "YEAR_LIMIT_EXCEEDED",
      });
    }

    const nextNumberString = `DAO-${year}-${nextNumber.toString().padStart(3, "0")}`;

    console.log(
      `🔢 Generated next DAO number: ${nextNumberString} for ${req.user?.email}`,
    );
    res.json({ nextNumber: nextNumberString });
  } catch (error) {
    console.error("Error in GET /api/dao/next-number:", error);
    res.status(500).json({
      error: "Failed to generate next DAO number",
      code: "GENERATION_ERROR",
    });
  }
});

// GET /api/dao/:id - Get DAO by ID (authenticated users only)
router.get("/:id", authenticate, (req, res) => {
  try {
    const { id } = req.params;

    // Basic ID validation
    if (!id || id.length > 100) {
      return res.status(400).json({
        error: "Invalid DAO ID",
        code: "INVALID_ID",
      });
    }

    const dao = daoStorage.findById(id);
    if (!dao) {
      return res.status(404).json({
        error: "DAO not found",
        code: "DAO_NOT_FOUND",
      });
    }

    console.log(`📄 Serving DAO ${id} to ${req.user?.email}`);
    return res.json(dao);
  } catch (error) {
    console.error("Error in GET /api/dao/:id:", error);
    return res.status(500).json({
      error: "Failed to fetch DAO",
      code: "FETCH_ERROR",
    });
  }
});

// POST /api/dao - Create new DAO (admin only)
router.post(
  "/",
  authenticate,
  requireAdmin,
  auditLog("CREATE_DAO"),
  sensitiveOperationLimit(),
  (req, res) => {
    try {
      // Validate and sanitize input
      const validatedData = createDaoSchema.parse(req.body);

      // Additional security checks
      if (daoStorage.size() > 10000) {
        return res.status(400).json({
          error: "Maximum number of DAOs reached",
          code: "STORAGE_LIMIT",
        });
      }

      // Check for duplicate numeroListe
      const existingDao = daoStorage
        .getAll()
        .find((dao) => dao.numeroListe === validatedData.numeroListe);

      if (existingDao) {
        return res.status(400).json({
          error: "DAO number already exists",
          code: "DUPLICATE_NUMBER",
        });
      }

      // Sanitize string fields
      const sanitizedData = {
        ...validatedData,
        numeroListe: sanitizeString(validatedData.numeroListe),
        objetDossier: sanitizeString(validatedData.objetDossier),
        reference: sanitizeString(validatedData.reference),
        autoriteContractante: sanitizeString(
          validatedData.autoriteContractante,
        ),
        equipe: validatedData.equipe.map((member) => ({
          ...member,
          name: sanitizeString(member.name),
        })),
      };

      const id = generateId();
      const now = new Date().toISOString();

      // Use provided tasks or default tasks
      const tasks =
        validatedData.tasks ||
        DEFAULT_TASKS.map((task) => ({
          ...task,
          progress: null,
          comment: "",
        }));

      const newDao: Dao = {
        ...sanitizedData,
        id,
        tasks,
        createdAt: now,
        updatedAt: now,
      };

      daoStorage.add(newDao);
      console.log(
        `✨ Created new DAO: ${newDao.numeroListe} by ${req.user?.email}`,
      );
      res.status(201).json(newDao);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "Validation error",
          details: error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
          code: "VALIDATION_ERROR",
        });
      }

      console.error("Error in POST /api/dao:", error);
      res.status(500).json({
        error: "Failed to create DAO",
        code: "CREATE_ERROR",
      });
    }
  },
);

// PUT /api/dao/:id - Update DAO (users and admins)
router.put(
  "/:id",
  authenticate,
  requireUser,
  auditLog("UPDATE_DAO"),
  (req, res) => {
    try {
      const { id } = req.params;

      // Basic ID validation
      if (!id || id.length > 100) {
        return res.status(400).json({
          error: "Invalid DAO ID",
          code: "INVALID_ID",
        });
      }

      const validatedData = updateDaoSchema.parse(req.body);
      const index = daoStorage.findIndexById(id);

      if (index === -1) {
        return res.status(404).json({
          error: "DAO not found",
          code: "DAO_NOT_FOUND",
        });
      }

      // Check for duplicate numeroListe if being updated
      if (validatedData.numeroListe) {
        const existingDao = daoStorage
          .getAll()
          .find(
            (dao) =>
              dao.id !== id && dao.numeroListe === validatedData.numeroListe,
          );

        if (existingDao) {
          return res.status(400).json({
            error: "DAO number already exists",
            code: "DUPLICATE_NUMBER",
          });
        }
      }

      // Sanitize string fields
      const sanitizedUpdates: any = { ...validatedData };
      if (validatedData.numeroListe) {
        sanitizedUpdates.numeroListe = sanitizeString(
          validatedData.numeroListe,
        );
      }
      if (validatedData.objetDossier) {
        sanitizedUpdates.objetDossier = sanitizeString(
          validatedData.objetDossier,
        );
      }
      if (validatedData.reference) {
        sanitizedUpdates.reference = sanitizeString(validatedData.reference);
      }
      if (validatedData.autoriteContractante) {
        sanitizedUpdates.autoriteContractante = sanitizeString(
          validatedData.autoriteContractante,
        );
      }
      if (validatedData.equipe) {
        sanitizedUpdates.equipe = validatedData.equipe.map((member) => ({
          ...member,
          name: sanitizeString(member.name),
        }));
      }

      const currentDao = daoStorage.getAll()[index];
      const updatedDao = {
        ...currentDao,
        ...sanitizedUpdates,
        updatedAt: new Date().toISOString(),
      };

      daoStorage.updateAtIndex(index, updatedDao);
      console.log(`📝 Updated DAO: ${id} by ${req.user?.email}`);
      res.json(updatedDao);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "Validation error",
          details: error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
          code: "VALIDATION_ERROR",
        });
      }

      console.error("Error in PUT /api/dao/:id:", error);
      res.status(500).json({
        error: "Failed to update DAO",
        code: "UPDATE_ERROR",
      });
    }
  },
);

// DELETE /api/dao/:id - Delete DAO (admin only)
router.delete(
  "/:id",
  authenticate,
  requireAdmin,
  auditLog("DELETE_DAO"),
  sensitiveOperationLimit(),
  (req, res) => {
    try {
      const { id } = req.params;

      // Basic ID validation
      if (!id || id.length > 100) {
        return res.status(400).json({
          error: "Invalid DAO ID",
          code: "INVALID_ID",
        });
      }

      const index = daoStorage.findIndexById(id);

      if (index === -1) {
        return res.status(404).json({
          error: "DAO not found",
          code: "DAO_NOT_FOUND",
        });
      }

      const deletedDao = daoStorage.getAll()[index];
      daoStorage.deleteById(id);

      console.log(
        `🗑️ Deleted DAO: ${id} (${deletedDao.numeroListe}) by ${req.user?.email}`,
      );
      res.json({
        message: "DAO deleted successfully",
        deletedDao: { id: deletedDao.id, numeroListe: deletedDao.numeroListe },
      });
    } catch (error) {
      console.error("Error in DELETE /api/dao/:id:", error);
      res.status(500).json({
        error: "Failed to delete DAO",
        code: "DELETE_ERROR",
      });
    }
  },
);

// PUT /api/dao/:id/tasks/:taskId - Update specific task
router.put(
  "/:id/tasks/:taskId",
  authenticate,
  requireUser,
  auditLog("UPDATE_TASK"),
  (req, res) => {
    try {
      const { id, taskId } = req.params;

      // Validate parameters
      if (!id || id.length > 100) {
        return res.status(400).json({
          error: "Invalid DAO ID",
          code: "INVALID_DAO_ID",
        });
      }

      const parsedTaskId = parseInt(taskId);
      if (isNaN(parsedTaskId) || parsedTaskId < 1) {
        return res.status(400).json({
          error: "Invalid task ID",
          code: "INVALID_TASK_ID",
        });
      }

      const validatedData = taskUpdateSchema.parse(req.body);
      const daoIndex = daoStorage.findIndexById(id);

      if (daoIndex === -1) {
        return res.status(404).json({
          error: "DAO not found",
          code: "DAO_NOT_FOUND",
        });
      }

      const dao = daoStorage.findById(id)!;
      const task = dao.tasks.find((t) => t.id === parsedTaskId);

      if (!task) {
        return res.status(404).json({
          error: "Task not found",
          code: "TASK_NOT_FOUND",
        });
      }

      // Update task fields safely
      if (typeof validatedData.progress === "number") {
        task.progress = validatedData.progress;
      }
      if (typeof validatedData.comment === "string") {
        task.comment = sanitizeString(validatedData.comment);
      }
      if (typeof validatedData.isApplicable === "boolean") {
        task.isApplicable = validatedData.isApplicable;
      }
      if (typeof validatedData.assignedTo === "string") {
        task.assignedTo = sanitizeString(validatedData.assignedTo);
      }

      task.lastUpdatedBy = req.user!.id;
      task.lastUpdatedAt = new Date().toISOString();
      dao.updatedAt = new Date().toISOString();

      // Update the DAO in storage
      daoStorage.updateAtIndex(daoIndex, dao);

      console.log(
        `📋 Updated task ${parsedTaskId} in DAO ${id} by ${req.user?.email}`,
      );
      res.json(dao);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "Validation error",
          details: error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
          code: "VALIDATION_ERROR",
        });
      }

      console.error("Error in PUT /api/dao/:id/tasks/:taskId:", error);
      res.status(500).json({
        error: "Failed to update task",
        code: "TASK_UPDATE_ERROR",
      });
    }
  },
);

export default router;

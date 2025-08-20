import express from "express";
import { z } from "zod";
import { daoStorage } from "../data/daoStorage";
import { authenticate, requireAdmin, auditLog } from "../middleware/auth";
import type { DaoTask } from "@shared/dao";

const router = express.Router();

// Validation schemas
const createTaskSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  isApplicable: z.boolean(),
  progress: z.number().min(0).max(100).nullable(),
  comment: z.string().max(1000).optional(),
  assignedTo: z.string().max(50).optional(),
});

const updateTaskNameSchema = z.object({
  name: z.string().min(1).max(200).trim(),
});

// Helper to sanitize string
function sanitizeString(input: string): string {
  return input.replace(/<[^>]*>/g, "").trim();
}

// POST /api/dao/:daoId/tasks - Add new task (admin only)
router.post(
  "/:daoId/tasks",
  authenticate,
  requireAdmin,
  auditLog("ADD_TASK"),
  (req, res) => {
    try {
      const { daoId } = req.params;

      // Basic ID validation
      if (!daoId || daoId.length > 100) {
        return res.status(400).json({
          error: "Invalid DAO ID",
          code: "INVALID_DAO_ID",
        });
      }

      const validatedData = createTaskSchema.parse(req.body);
      const daoIndex = daoStorage.findIndexById(daoId);

      if (daoIndex === -1) {
        return res.status(404).json({
          error: "DAO not found",
          code: "DAO_NOT_FOUND",
        });
      }

      const dao = daoStorage.findById(daoId)!;

      // Generate new task ID
      const existingIds = dao.tasks.map((t) => t.id);
      const newId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;

      // Sanitize and create new task
      const newTask: DaoTask = {
        id: newId,
        name: sanitizeString(validatedData.name),
        progress: validatedData.isApplicable ? validatedData.progress : null,
        comment: validatedData.comment
          ? sanitizeString(validatedData.comment)
          : undefined,
        isApplicable: validatedData.isApplicable,
        assignedTo: validatedData.assignedTo,
        lastUpdatedBy: req.user!.id,
        lastUpdatedAt: new Date().toISOString(),
      };

      dao.tasks.push(newTask);
      dao.updatedAt = new Date().toISOString();

      // Update the DAO in storage
      daoStorage.updateAtIndex(daoIndex, dao);

      console.log(
        `✨ Added new task "${newTask.name}" to DAO ${daoId} by ${req.user?.email}`,
      );
      res.status(201).json(dao);
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

      console.error("Error in POST /api/dao/:daoId/tasks:", error);
      res.status(500).json({
        error: "Failed to add task",
        code: "ADD_TASK_ERROR",
      });
    }
  },
);

// PUT /api/dao/:daoId/tasks/:taskId/name - Update task name (admin only)
router.put(
  "/:daoId/tasks/:taskId/name",
  authenticate,
  requireAdmin,
  auditLog("UPDATE_TASK_NAME"),
  (req, res) => {
    try {
      const { daoId, taskId } = req.params;

      // Validate parameters
      if (!daoId || daoId.length > 100) {
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

      const validatedData = updateTaskNameSchema.parse(req.body);
      const daoIndex = daoStorage.findIndexById(daoId);

      if (daoIndex === -1) {
        return res.status(404).json({
          error: "DAO not found",
          code: "DAO_NOT_FOUND",
        });
      }

      const dao = daoStorage.findById(daoId)!;
      const task = dao.tasks.find((t) => t.id === parsedTaskId);

      if (!task) {
        return res.status(404).json({
          error: "Task not found",
          code: "TASK_NOT_FOUND",
        });
      }

      // Update task name
      const oldName = task.name;
      task.name = sanitizeString(validatedData.name);
      task.lastUpdatedBy = req.user!.id;
      task.lastUpdatedAt = new Date().toISOString();
      dao.updatedAt = new Date().toISOString();

      // Update the DAO in storage
      daoStorage.updateAtIndex(daoIndex, dao);

      console.log(
        `📝 Updated task name from "${oldName}" to "${task.name}" in DAO ${daoId} by ${req.user?.email}`,
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

      console.error("Error in PUT /api/dao/:daoId/tasks/:taskId/name:", error);
      res.status(500).json({
        error: "Failed to update task name",
        code: "UPDATE_TASK_NAME_ERROR",
      });
    }
  },
);

// DELETE /api/dao/:daoId/tasks/:taskId - Delete task (admin only)
router.delete(
  "/:daoId/tasks/:taskId",
  authenticate,
  requireAdmin,
  auditLog("DELETE_TASK"),
  (req, res) => {
    try {
      const { daoId, taskId } = req.params;

      // Validate parameters
      if (!daoId || daoId.length > 100) {
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

      const daoIndex = daoStorage.findIndexById(daoId);

      if (daoIndex === -1) {
        return res.status(404).json({
          error: "DAO not found",
          code: "DAO_NOT_FOUND",
        });
      }

      const dao = daoStorage.findById(daoId)!;
      const taskIndex = dao.tasks.findIndex((t) => t.id === parsedTaskId);

      if (taskIndex === -1) {
        return res.status(404).json({
          error: "Task not found",
          code: "TASK_NOT_FOUND",
        });
      }

      const deletedTask = dao.tasks[taskIndex];
      dao.tasks.splice(taskIndex, 1);
      dao.updatedAt = new Date().toISOString();

      // Update the DAO in storage
      daoStorage.updateAtIndex(daoIndex, dao);

      console.log(
        `🗑️ Deleted task "${deletedTask.name}" from DAO ${daoId} by ${req.user?.email}`,
      );
      res.json({
        message: "Task deleted successfully",
        deletedTask: { id: deletedTask.id, name: deletedTask.name },
        dao: dao,
      });
    } catch (error) {
      console.error("Error in DELETE /api/dao/:daoId/tasks/:taskId:", error);
      res.status(500).json({
        error: "Failed to delete task",
        code: "DELETE_TASK_ERROR",
      });
    }
  },
);

export default router;

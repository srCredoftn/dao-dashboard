import express from "express";
import { CommentService } from "../services/commentService";
import { authenticate, requireUser } from "../middleware/auth";

const router = express.Router();

// Initialize sample comments
CommentService.initializeSampleComments();

// GET /api/comments/dao/:daoId - Get all comments for a DAO
router.get("/dao/:daoId", authenticate, async (req, res) => {
  try {
    const { daoId } = req.params;
    const comments = await CommentService.getDaoComments(daoId);
    res.json(comments);
  } catch (error) {
    console.error("Error getting DAO comments:", error);
    res.status(500).json({ error: "Failed to get comments" });
  }
});

// GET /api/comments/dao/:daoId/task/:taskId - Get comments for a specific task
router.get("/dao/:daoId/task/:taskId", authenticate, async (req, res) => {
  try {
    const { daoId, taskId } = req.params;
    const comments = await CommentService.getTaskComments(
      daoId,
      parseInt(taskId),
    );
    res.json(comments);
  } catch (error) {
    console.error("Error getting task comments:", error);
    res.status(500).json({ error: "Failed to get task comments" });
  }
});

// POST /api/comments - Add a new comment
router.post("/", authenticate, async (req, res) => {
  try {
    const { daoId, taskId, content } = req.body;

    if (!daoId || taskId === undefined || !content?.trim()) {
      return res
        .status(400)
        .json({ error: "DAO ID, task ID, and content are required" });
    }

    const commentData = {
      daoId,
      taskId: parseInt(taskId),
      userId: req.user!.id,
      userName: req.user!.name,
      content: content.trim(),
    };

    const newComment = await CommentService.addComment(commentData);
    res.status(201).json(newComment);
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({ error: "Failed to add comment" });
  }
});

// PUT /api/comments/:id - Update a comment (only by author)
router.put("/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content?.trim()) {
      return res.status(400).json({ error: "Content is required" });
    }

    const updatedComment = await CommentService.updateComment(
      id,
      req.user!.id,
      content.trim(),
    );

    if (!updatedComment) {
      return res.status(404).json({ error: "Comment not found" });
    }

    res.json(updatedComment);
  } catch (error) {
    console.error("Error updating comment:", error);
    if (error.message.includes("Unauthorized")) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to update comment" });
  }
});

// DELETE /api/comments/:id - Delete a comment (author or admin)
router.delete("/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await CommentService.deleteComment(
      id,
      req.user!.id,
      req.user!.role,
    );

    if (!deleted) {
      return res.status(404).json({ error: "Comment not found" });
    }

    res.json({ message: "Comment deleted successfully" });
  } catch (error) {
    console.error("Error deleting comment:", error);
    if (error.message.includes("Unauthorized")) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to delete comment" });
  }
});

// GET /api/comments/recent - Get recent comments across all DAOs
router.get("/recent", authenticate, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const comments = await CommentService.getRecentComments(limit);
    res.json(comments);
  } catch (error) {
    console.error("Error getting recent comments:", error);
    res.status(500).json({ error: "Failed to get recent comments" });
  }
});

export default router;

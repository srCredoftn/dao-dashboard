import express from "express";
import { z } from "zod";
import { UserModel } from "../models/User.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

// Validation schemas
const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  role: z.enum(["admin", "user"]),
  password: z.string().min(6).optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  role: z.enum(["admin", "user"]).optional(),
  isActive: z.boolean().optional(),
});

// GET /api/users - Get all users (admin only)
router.get("/", authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await UserModel.find()
      .select("-password")
      .sort({ createdAt: -1 });

    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// GET /api/users/:id - Get user by ID (admin only)
router.get("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const user = await UserModel.findById(req.params.id).select("-password");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// POST /api/users - Create new user (admin only)
router.post("/", authenticate, requireAdmin, async (req, res) => {
  try {
    const validatedData = createUserSchema.parse(req.body);

    // Check if user already exists
    const existingUser = await UserModel.findOne({
      email: validatedData.email.toLowerCase(),
    });

    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Create new user with default password if not provided
    const defaultPassword = validatedData.password || "changeme123";

    const newUser = new UserModel({
      name: validatedData.name,
      email: validatedData.email.toLowerCase(),
      password: defaultPassword,
      role: validatedData.role,
    });

    await newUser.save();

    console.log(`👤 New user created: ${newUser.email} Role: ${newUser.role}`);
    res.status(201).json(newUser.toJSON());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors,
      });
    }

    console.error("Error creating user:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

// PUT /api/users/:id - Update user (admin only)
router.put("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const validatedData = updateUserSchema.parse(req.body);

    const user = await UserModel.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check email uniqueness if being updated
    if (validatedData.email) {
      const existingUser = await UserModel.findOne({
        email: validatedData.email.toLowerCase(),
        _id: { $ne: req.params.id },
      });

      if (existingUser) {
        return res.status(400).json({ error: "Email already exists" });
      }

      user.email = validatedData.email.toLowerCase();
    }

    // Update other fields
    if (validatedData.name) user.name = validatedData.name;
    if (validatedData.role) user.role = validatedData.role;
    if (typeof validatedData.isActive === "boolean") {
      user.isActive = validatedData.isActive;
    }

    await user.save();

    console.log(`📝 User updated: ${user.email}`);
    res.json(user.toJSON());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors,
      });
    }

    console.error("Error updating user:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// DELETE /api/users/:id - Deactivate user (admin only)
router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent admin from deactivating themselves
    if (req.user?.id === id) {
      return res.status(400).json({
        error: "Cannot deactivate your own account",
      });
    }

    const user = await UserModel.findById(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.isActive = false;
    await user.save();

    console.log(`🚫 User deactivated: ${user.email}`);
    res.json({ message: "User deactivated successfully" });
  } catch (error) {
    console.error("Error deactivating user:", error);
    res.status(500).json({ error: "Failed to deactivate user" });
  }
});

// PUT /api/users/:id/activate - Reactivate user (admin only)
router.put("/:id/activate", authenticate, requireAdmin, async (req, res) => {
  try {
    const user = await UserModel.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.isActive = true;
    await user.save();

    console.log(`✅ User reactivated: ${user.email}`);
    res.json(user.toJSON());
  } catch (error) {
    console.error("Error reactivating user:", error);
    res.status(500).json({ error: "Failed to reactivate user" });
  }
});

export default router;

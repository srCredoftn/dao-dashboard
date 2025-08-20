import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { UserModel } from "../models/User.js";
import {
  generateToken,
  authenticate,
  requireAdmin,
} from "../middleware/auth.js";
import { emailService } from "../services/emailService.js";
import type { LoginCredentials, AuthResponse } from "@shared/dao.js";

const router = express.Router();

// Validation schemas
const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Invalid email format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["admin", "user"]).optional(),
});

const passwordChangeSchema = z.object({
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

const profileUpdateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Invalid email format"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email format"),
});

const verifyResetTokenSchema = z.object({
  email: z.string().email("Invalid email format"),
  token: z.string().min(6, "Token must be at least 6 characters"),
});

const resetPasswordSchema = z.object({
  email: z.string().email("Invalid email format"),
  token: z.string().min(6, "Token must be at least 6 characters"),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

// POST /api/auth/login - User login
router.post("/login", async (req, res) => {
  try {
    // Validate input
    const validatedData = loginSchema.parse(req.body);

    // Find user by email
    const user = await UserModel.findOne({
      email: validatedData.email.toLowerCase(),
      isActive: true,
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Check password
    const isValidPassword = await user.comparePassword(validatedData.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Update last login
    user.lastLogin = new Date().toISOString();
    await user.save();

    // Generate JWT token
    const token = generateToken(user);

    // Prepare response
    const authResponse: AuthResponse = {
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
      },
      token,
    };

    console.log(`🔐 User logged in: ${user.email} Role: ${user.role}`);
    res.json(authResponse);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors,
      });
    }

    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// POST /api/auth/logout - User logout
router.post("/logout", authenticate, async (req, res) => {
  try {
    // In a Redis-based session system, we would invalidate the token here
    // For now, we just return success (client will remove token)
    console.log(`🔓 User logged out: ${req.user?.email}`);
    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Logout failed" });
  }
});

// GET /api/auth/me - Get current user info
router.get("/me", authenticate, async (req, res) => {
  try {
    // User info is already validated in authenticate middleware
    res.json({ user: req.user });
  } catch (error) {
    console.error("Get user info error:", error);
    res.status(500).json({ error: "Failed to get user info" });
  }
});

// GET /api/auth/users - Get all users (admin only)
router.get("/users", authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await UserModel.find({ isActive: true })
      .select("-password")
      .sort({ createdAt: -1 });

    res.json(users);
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ error: "Failed to get users" });
  }
});

// POST /api/auth/users - Create new user (admin only)
router.post("/users", authenticate, requireAdmin, async (req, res) => {
  try {
    const validatedData = registerSchema.parse(req.body);

    // Check if user already exists
    const existingUser = await UserModel.findOne({
      email: validatedData.email.toLowerCase(),
    });

    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Create new user
    const newUser = new UserModel({
      name: validatedData.name,
      email: validatedData.email.toLowerCase(),
      password: validatedData.password,
      role: validatedData.role || "user",
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

    console.error("Create user error:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

// PUT /api/auth/users/:id/role - Update user role (admin only)
router.put("/users/:id/role", authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!["admin", "user"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const user = await UserModel.findById(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.role = role;
    await user.save();

    console.log(`🔄 User role updated: ${user.email} → ${role}`);
    res.json(user.toJSON());
  } catch (error) {
    console.error("Update user role error:", error);
    res.status(500).json({ error: "Failed to update user role" });
  }
});

// DELETE /api/auth/users/:id - Deactivate user (admin only)
router.delete("/users/:id", authenticate, requireAdmin, async (req, res) => {
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
    console.error("Deactivate user error:", error);
    res.status(500).json({ error: "Failed to deactivate user" });
  }
});

// POST /api/auth/change-password - Change password
router.post("/change-password", authenticate, async (req, res) => {
  try {
    const validatedData = passwordChangeSchema.parse(req.body);

    const user = await UserModel.findById(req.user!.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.password = validatedData.newPassword;
    await user.save();

    console.log(`🔑 Password changed for: ${user.email}`);
    res.json({ message: "Password changed successfully" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors,
      });
    }

    console.error("Change password error:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
});

// PUT /api/auth/profile - Update user profile
router.put("/profile", authenticate, async (req, res) => {
  try {
    const validatedData = profileUpdateSchema.parse(req.body);

    // Check if email is already taken by another user
    const existingUser = await UserModel.findOne({
      email: validatedData.email.toLowerCase(),
      _id: { $ne: req.user!.id },
    });

    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const user = await UserModel.findById(req.user!.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.name = validatedData.name;
    user.email = validatedData.email.toLowerCase();
    await user.save();

    const authUser = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
    };

    console.log(`📝 Profile updated for: ${user.email}`);
    res.json(authUser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation error",
        details: error.errors,
      });
    }

    console.error("Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

export default router;

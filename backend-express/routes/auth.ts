import express from "express";
import { AuthService } from "../services/authService";
import { authenticate, requireAdmin } from "../middleware/auth";
import { authLog, devLog } from "../utils/devLog";
import type { LoginCredentials } from "@shared/dao";

const router = express.Router();

// POST /api/auth/login - User login
router.post("/login", async (req, res) => {
  try {
    const credentials: LoginCredentials = req.body;

    if (!credentials.email || !credentials.password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const authResponse = await AuthService.login(credentials);
    if (!authResponse) {
      return res.status(401).json({ error: "Identifiants incorrects" });
    }

    return res.json(authResponse);
  } catch (error) {
    authLog.login(req.body.email || "unknown", false);
    return res.status(401).json({ error: "Identifiants incorrects" });
  }
});

// POST /api/auth/logout - User logout
router.post("/logout", authenticate, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.substring(7); // Remove 'Bearer ' prefix

    if (token) {
      await AuthService.logout(token);
    }

    return res.json({ message: "Logged out successfully" });
  } catch (error) {
    devLog.error("Logout error:", error);
    return res.status(500).json({ error: "Logout failed" });
  }
});

// GET /api/auth/me - Get current user info
router.get("/me", authenticate, async (req, res) => {
  try {
    return res.json({ user: req.user });
  } catch (error) {
    devLog.error("Get user info error:", error);
    return res.status(500).json({ error: "Failed to get user info" });
  }
});

// GET /api/auth/users - Get all users (admin only)
router.get("/users", authenticate, requireAdmin, async (_req, res) => {
  try {
    const users = await AuthService.getAllUsers();
    return res.json(users);
  } catch (error) {
    devLog.error("Get users error:", error);
    return res.status(500).json({ error: "Failed to get users" });
  }
});

// POST /api/auth/users - Create new user (admin only)
router.post("/users", authenticate, requireAdmin, async (req, res) => {
  try {
    const userData = req.body;

    if (!userData.name || !userData.email || !userData.role) {
      return res
        .status(400)
        .json({ error: "Name, email, and role are required" });
    }

    const newUser = await AuthService.createUser({
      name: userData.name,
      email: userData.email,
      role: userData.role,
      password: userData.password, // Pass the password to the service
    });

    return res.status(201).json(newUser);
  } catch (error) {
    devLog.error("Create user error:", error);
    return res.status(500).json({ error: "Failed to create user" });
  }
});

// PUT /api/auth/users/:id/role - Update user role (admin only)
router.put("/users/:id/role", authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({ error: "Role is required" });
    }

    const updatedUser = await AuthService.updateUserRole(id, role);
    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json(updatedUser);
  } catch (error) {
    devLog.error("Update user role error:", error);
    return res.status(500).json({ error: "Failed to update user role" });
  }
});

// DELETE /api/auth/users/:id - Deactivate user (admin only)
router.delete("/users/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent admin from deactivating themselves
    if (req.user?.id === id) {
      return res
        .status(400)
        .json({ error: "Cannot deactivate your own account" });
    }

    const deactivated = await AuthService.deactivateUser(id);
    if (!deactivated) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({ message: "User deactivated successfully" });
  } catch (error) {
    devLog.error("Deactivate user error:", error);
    return res.status(500).json({ error: "Failed to deactivate user" });
  }
});

// POST /api/auth/change-password - Change password
router.post("/change-password", authenticate, async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters long" });
    }

    const success = await AuthService.changePassword(req.user!.id, newPassword);
    if (!success) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({ message: "Password changed successfully" });
  } catch (error) {
    devLog.error("Change password error:", error);
    return res.status(500).json({ error: "Failed to change password" });
  }
});

// PUT /api/auth/profile - Update user profile
router.put("/profile", authenticate, async (req, res) => {
  try {
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: "Name and email are required" });
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    const updatedUser = await AuthService.updateProfile(req.user!.id, {
      name,
      email,
    });
    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // Return updated auth user
    const authUser = {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
    };

    return res.json(authUser);
  } catch (error) {
    devLog.error("Update profile error:", error);
    if ((error as Error).message === "Email already exists") {
      return res.status(400).json({ error: "Email already exists" });
    }
    return res.status(500).json({ error: "Failed to update profile" });
  }
});

// POST /api/auth/forgot-password - Request password reset
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    const token = await AuthService.generateResetToken(email);

    if (!token) {
      // Don't reveal if email exists or not for security
      return res.json({
        message:
          "Si cet email existe, un code de réinitialisation a été envoyé.",
      });
    }

    // In production, send email here
    // For development, we'll return the token in the response
    devLog.info(`📧 Password reset code generated for ${email}`);

    return res.json({
      message:
        "Un code de réinitialisation a ét�� envoyé à votre adresse email.",
      // Remove this in production - only for development
      developmentToken: token,
    });
  } catch (error) {
    devLog.error("Forgot password error:", error);
    return res
      .status(500)
      .json({ error: "Failed to process password reset request" });
  }
});

// POST /api/auth/verify-reset-token - Verify reset token
router.post("/verify-reset-token", async (req, res) => {
  try {
    const { email, token } = req.body;

    if (!email || !token) {
      return res.status(400).json({ error: "Email and token are required" });
    }

    const isValid = await AuthService.verifyResetToken(token, email);

    if (!isValid) {
      return res.status(400).json({ error: "Code invalide ou expiré" });
    }

    return res.json({ message: "Code vérifié avec succès" });
  } catch (error) {
    devLog.error("Verify reset token error:", error);
    return res.status(500).json({ error: "Failed to verify reset token" });
  }
});

// POST /api/auth/reset-password - Reset password with token
router.post("/reset-password", async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;

    if (!email || !token || !newPassword) {
      return res.status(400).json({
        error: "Email, token, and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        error: "Le mot de passe doit contenir au moins 6 caractères",
      });
    }

    const success = await AuthService.resetPasswordWithToken(
      token,
      email,
      newPassword,
    );

    if (!success) {
      return res.status(400).json({ error: "Code invalide ou expiré" });
    }

    return res.json({ message: "Mot de passe réinitialisé avec succès" });
  } catch (error) {
    devLog.error("Reset password error:", error);
    return res.status(500).json({ error: "Failed to reset password" });
  }
});

export default router;

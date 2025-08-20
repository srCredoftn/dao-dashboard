import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UserModel, UserDocument } from "../models/User.js";
import type { UserRole } from "@shared/dao.js";

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: UserRole;
        name: string;
      };
    }
  }
}

const JWT_SECRET =
  process.env.JWT_SECRET || "fallback-secret-change-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

// Generate JWT token
export const generateToken = (user: UserDocument): string => {
  return jwt.sign(
    {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );
};

// Verify JWT token
export const verifyToken = (token: string): any => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error("Invalid or expired token");
  }
};

// Authentication middleware
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Access token required" });
      return;
    }

    const token = authHeader.substring(7);

    if (!token) {
      res.status(401).json({ error: "Access token required" });
      return;
    }

    // Verify and decode token
    const decoded = verifyToken(token);

    // Find user in database
    const user = await UserModel.findById(decoded.id).select("-password");

    if (!user || !user.isActive) {
      res.status(401).json({ error: "User not found or inactive" });
      return;
    }

    // Add user to request object
    req.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.name,
    };

    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

// Role-based authorization middleware
export const authorize = (roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: "Insufficient permissions",
        required: roles,
        current: req.user.role,
      });
      return;
    }

    next();
  };
};

// Convenience middleware for admin-only routes
export const requireAdmin = authorize(["admin"]);

// Convenience middleware for user-level routes (admin + user)
export const requireUser = authorize(["admin", "user"]);

// Optional authentication (for routes that work with or without auth)
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);

      if (token) {
        const decoded = verifyToken(token);
        const user = await UserModel.findById(decoded.id).select("-password");

        if (user && user.isActive) {
          req.user = {
            id: user._id.toString(),
            email: user.email,
            role: user.role,
            name: user.name,
          };
        }
      }
    }

    next();
  } catch (error) {
    // Don't fail on optional auth, just continue without user
    next();
  }
};

// Check if user is the owner of a resource or admin
export const requireOwnershipOrAdmin = (resourceUserIdPath: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    // Admin can access everything
    if (req.user.role === "admin") {
      next();
      return;
    }

    // Get resource user ID from request (params, body, etc.)
    const resourceUserId =
      req.params[resourceUserIdPath] || req.body[resourceUserIdPath];

    if (req.user.id !== resourceUserId) {
      res.status(403).json({ error: "Can only access your own resources" });
      return;
    }

    next();
  };
};

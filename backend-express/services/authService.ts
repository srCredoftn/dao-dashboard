import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type {
  User,
  AuthUser,
  LoginCredentials,
  AuthResponse,
  UserRole,
} from "@shared/dao";

// JWT Configuration - Securite renforcee
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h";

// Validation du secret JWT au démarrage
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("🚨 ERREUR CRITIQUE: JWT_SECRET manquant ou trop court");
  console.error(
    "   Veuillez définir une variable d'environnement JWT_SECRET de plus de 32 caractères",
  );
  process.exit(1);
}

// Secure in-memory user storage with hashed passwords
let users: User[] = [];
const userPasswords: Record<string, string> = {};

// Password reset tokens (in production, use Redis or database)
const resetTokens: Record<string, { email: string; expires: Date }> = {};

// Session tracking (in production, use Redis)
const activeSessions: Set<string> = new Set();

// Initialize users with hashed passwords
async function initializeUsers() {
  const defaultUsers = [
    {
      id: "1",
      name: "Admin User",
      email: "admin@2snd.fr",
      role: "admin" as UserRole,
      password: "admin123",
    },
    {
      id: "2",
      name: "Marie Dubois",
      email: "marie.dubois@2snd.fr",
      role: "user" as UserRole,
      password: "marie123",
    },
    {
      id: "3",
      name: "Pierre Martin",
      email: "pierre.martin@2snd.fr",
      role: "user" as UserRole,
      password: "pierre123",
    },
    {
      id: "4",
      name: "Credo FONTON",
      email: "fontoncredo@gmail.com",
      role: "user" as UserRole,
      password: "W@l7t8WkaCYm",
    },
  ];

  for (const userData of defaultUsers) {
    const hashedPassword = await bcrypt.hash(userData.password, 12);

    const user: User = {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      role: userData.role,
      createdAt: new Date().toISOString(),
      isActive: true,
    };

    users.push(user);
    userPasswords[userData.email] = hashedPassword;
  }

  console.log("🔐 AuthService initialized with secure password hashing");
  console.log("👤 Users available:");
  users.forEach((user) => {
    console.log(`  - ${user.email} (${user.role})`);
  });
}

export class AuthService {
  // Initialize the service
  static async initialize() {
    await initializeUsers();
  }

  // Login user with secure password verification
  static async login(
    credentials: LoginCredentials,
  ): Promise<AuthResponse | null> {
    try {
      console.log(`🔐 Login attempt for: ${credentials.email}`);

      const user = users.find(
        (u) =>
          u.email.toLowerCase() === credentials.email.toLowerCase() &&
          u.isActive,
      );

      if (!user) {
        console.log(`❌ User not found: ${credentials.email}`);
        return null;
      }

      const hashedPassword = userPasswords[user.email];
      if (!hashedPassword) {
        console.log(`❌ No password hash found for: ${credentials.email}`);
        return null;
      }

      const isValidPassword = await bcrypt.compare(
        credentials.password,
        hashedPassword,
      );
      if (!isValidPassword) {
        console.log(`❌ Invalid password for: ${credentials.email}`);
        return null;
      }

      // Generate secure JWT token
      const authUser: AuthUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      };

      const token = jwt.sign(authUser, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
        issuer: "dao-management",
        audience: "dao-app",
      });

      // Track active session
      activeSessions.add(token);

      // Update last login
      user.lastLogin = new Date().toISOString();

      console.log(`✅ User logged in: ${user.email} Role: ${user.role}`);

      return {
        user: authUser,
        token,
      };
    } catch (error) {
      console.error("Login error:", error);
      return null;
    }
  }

  // Verify JWT token
  static async verifyToken(token: string): Promise<AuthUser | null> {
    try {
      console.log(`🔍 Verifying token: ${token.substring(0, 20)}...`);
      console.log(`📊 Active sessions count: ${activeSessions.size}`);

      // Premièrement, essayons de décoder et vérifier le JWT
      const decoded = jwt.verify(token, JWT_SECRET, {
        issuer: "dao-management",
        audience: "dao-app",
      }) as AuthUser;

      console.log(`✅ Token decoded successfully for user: ${decoded.email}`);

      // Verify user still exists and is active
      const user = users.find((u) => u.id === decoded.id && u.isActive);
      if (!user) {
        console.log(`❌ User not found or inactive: ${decoded.id}`);
        activeSessions.delete(token);
        return null;
      }

      // Si le token est valide mais pas dans les sessions actives (ex: après redémarrage),
      // on l'ajoute automatiquement aux sessions actives
      if (!activeSessions.has(token)) {
        console.log(
          `🔄 Token valid but not in sessions, adding to active sessions`,
        );
        activeSessions.add(token);
      }

      console.log(`✅ Token verification successful for: ${user.email}`);
      return decoded;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        console.log(`❌ JWT Error: ${error.message}`);
      } else {
        console.log(`❌ Token verification error:`, error);
      }
      activeSessions.delete(token);
      return null;
    }
  }

  // Logout user
  static async logout(token: string): Promise<void> {
    activeSessions.delete(token);
  }

  // Get current user
  static async getCurrentUser(token: string): Promise<AuthUser | null> {
    return this.verifyToken(token);
  }

  // Get all users (admin only)
  static async getAllUsers(): Promise<User[]> {
    return users.filter((u) => u.isActive);
  }

  // Create new user with hashed password
  static async createUser(userData: {
    name: string;
    email: string;
    role: UserRole;
    password?: string;
  }): Promise<User> {
    const existingUser = users.find(
      (u) => u.email.toLowerCase() === userData.email.toLowerCase(),
    );

    if (existingUser) {
      throw new Error("User already exists");
    }

    const defaultPassword = userData.password || "changeme123";
    const hashedPassword = await bcrypt.hash(defaultPassword, 12);

    const newUser: User = {
      id: Date.now().toString(),
      name: userData.name,
      email: userData.email.toLowerCase(),
      role: userData.role,
      createdAt: new Date().toISOString(),
      isActive: true,
    };

    users.push(newUser);
    userPasswords[newUser.email] = hashedPassword;

    console.log(`👤 New user created: ${newUser.email} Role: ${newUser.role}`);
    return newUser;
  }

  // Update user role
  static async updateUserRole(
    id: string,
    role: UserRole,
  ): Promise<User | null> {
    const user = users.find((u) => u.id === id);
    if (!user) {
      return null;
    }

    user.role = role;
    console.log(`🔄 User role updated: ${user.email} → ${role}`);
    return user;
  }

  // Deactivate user
  static async deactivateUser(id: string): Promise<boolean> {
    const user = users.find((u) => u.id === id);
    if (!user) {
      return false;
    }

    user.isActive = false;

    // Invalidate all sessions for this user
    for (const token of activeSessions) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
        if (decoded.id === id) {
          activeSessions.delete(token);
        }
      } catch {
        // Token already invalid
      }
    }

    console.log(`🚫 User deactivated: ${user.email}`);
    return true;
  }

  // Change password
  static async changePassword(
    id: string,
    newPassword: string,
  ): Promise<boolean> {
    const user = users.find((u) => u.id === id);
    if (!user) {
      return false;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    userPasswords[user.email] = hashedPassword;

    console.log(`🔑 Password changed for: ${user.email}`);
    return true;
  }

  // Update profile
  static async updateProfile(
    id: string,
    updates: { name: string; email: string },
  ): Promise<User | null> {
    const user = users.find((u) => u.id === id);
    if (!user) {
      return null;
    }

    // Check if email is already taken
    if (updates.email !== user.email) {
      const existingUser = users.find(
        (u) =>
          u.email.toLowerCase() === updates.email.toLowerCase() && u.id !== id,
      );
      if (existingUser) {
        throw new Error("Email already exists");
      }

      // Update password storage key
      const passwordHash = userPasswords[user.email];
      delete userPasswords[user.email];
      userPasswords[updates.email.toLowerCase()] = passwordHash;
    }

    user.name = updates.name;
    user.email = updates.email.toLowerCase();

    console.log(`📝 Profile updated for: ${user.email}`);
    return user;
  }

  // Generate password reset token
  static async generateResetToken(email: string): Promise<string | null> {
    const user = users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.isActive,
    );

    if (!user) {
      return null;
    }

    const token = Math.random().toString(36).substring(2, 8).toUpperCase();
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    resetTokens[token] = { email: user.email, expires };

    console.log(`���� Password reset token generated for: ${user.email}`);
    return token;
  }

  // Verify reset token
  static async verifyResetToken(
    token: string,
    email: string,
  ): Promise<boolean> {
    const resetData = resetTokens[token];
    if (!resetData) {
      return false;
    }

    if (resetData.email.toLowerCase() !== email.toLowerCase()) {
      return false;
    }

    if (new Date() > resetData.expires) {
      delete resetTokens[token];
      return false;
    }

    return true;
  }

  // Reset password with token
  static async resetPasswordWithToken(
    token: string,
    email: string,
    newPassword: string,
  ): Promise<boolean> {
    const isValidToken = await this.verifyResetToken(token, email);
    if (!isValidToken) {
      return false;
    }

    const user = users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.isActive,
    );

    if (!user) {
      return false;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    userPasswords[user.email] = hashedPassword;

    // Remove used token
    delete resetTokens[token];

    console.log(`🔑 Password reset successful for: ${user.email}`);
    return true;
  }

  // Get active session count
  static getActiveSessionCount(): number {
    return activeSessions.size;
  }

  // Clean expired tokens (call periodically)
  static cleanupExpiredTokens(): void {
    let cleanedCount = 0;
    for (const token of activeSessions) {
      try {
        jwt.verify(token, JWT_SECRET);
      } catch {
        activeSessions.delete(token);
        cleanedCount++;
      }
    }
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned ${cleanedCount} expired tokens`);
    }
  }
}

// Initialize on startup
AuthService.initialize().catch(console.error);

// Debug: Log active sessions periodically in development
if (process.env.NODE_ENV === "development") {
  setInterval(() => {
    console.log(`📊 Active sessions: ${activeSessions.size}`);
  }, 30 * 1000); // Every 30 seconds in development
}

// Cleanup expired tokens every hour
setInterval(
  () => {
    console.log("🧹 Running token cleanup...");
    AuthService.cleanupExpiredTokens();
  },
  60 * 60 * 1000,
);

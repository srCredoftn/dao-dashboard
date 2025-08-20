import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";
import type { User, UserRole } from "@shared/dao.js";

// Interface for MongoDB document
export interface UserDocument extends Omit<User, "id">, Document {
  _id: mongoose.Types.ObjectId;
  password: string;
  comparePassword(candidatePassword: string): Promise<boolean>;
  isPasswordDefault(): boolean;
}

// User Schema
const userSchema = new Schema<UserDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
      index: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    role: {
      type: String,
      required: true,
      enum: ["admin", "user"] as UserRole[],
      default: "user",
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastLogin: {
      type: String, // ISO string
      default: null,
    },
    createdAt: {
      type: String, // ISO string
      default: () => new Date().toISOString(),
    },
    updatedAt: {
      type: String, // ISO string
      default: () => new Date().toISOString(),
    },
    // Password reset fields
    resetPasswordToken: {
      type: String,
      default: null,
    },
    resetPasswordExpires: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: false, // We handle timestamps manually
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.password;
        delete ret.resetPasswordToken;
        delete ret.resetPasswordExpires;
        return ret;
      },
    },
  },
);

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ createdAt: -1 });

// Pre-save middleware for password hashing and timestamp updates
userSchema.pre("save", async function (next) {
  const user = this as UserDocument;

  // Update timestamp
  if (user.isModified() && !user.isNew) {
    user.updatedAt = new Date().toISOString();
  }

  // Hash password if it was modified
  if (user.isModified("password")) {
    try {
      const salt = await bcrypt.genSalt(12);
      user.password = await bcrypt.hash(user.password, salt);
    } catch (error) {
      return next(error as Error);
    }
  }

  next();
});

// Instance methods
userSchema.methods.comparePassword = async function (
  candidatePassword: string,
): Promise<boolean> {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error("Password comparison failed");
  }
};

userSchema.methods.isPasswordDefault = function (): boolean {
  // Check if password is a default one (for new users)
  return ["changeme123", "password123", "default123"].includes(this.password);
};

// Static methods
userSchema.statics.findByEmail = function (email: string) {
  return this.findOne({ email: email.toLowerCase(), isActive: true });
};

userSchema.statics.findActiveUsers = function () {
  return this.find({ isActive: true }).sort({ createdAt: -1 });
};

userSchema.statics.findByRole = function (role: UserRole) {
  return this.find({ role, isActive: true });
};

userSchema.statics.createUser = async function (userData: {
  name: string;
  email: string;
  role?: UserRole;
  password?: string;
}) {
  const defaultPassword = userData.password || "changeme123";

  const user = new this({
    name: userData.name,
    email: userData.email.toLowerCase(),
    role: userData.role || "user",
    password: defaultPassword,
  });

  return await user.save();
};

// Virtual for full name formatting (if needed)
userSchema.virtual("displayName").get(function () {
  return this.name
    .split(" ")
    .map(
      (name: string) =>
        name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(),
    )
    .join(" ");
});

export const UserModel = mongoose.model<UserDocument>("User", userSchema);

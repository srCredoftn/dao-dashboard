import mongoose, { Schema, Document } from "mongoose";
import type { Dao, DaoTask, TeamMember } from "@shared/dao.js";

// Interface for MongoDB document
export interface DaoDocument extends Omit<Dao, "id">, Document {
  _id: mongoose.Types.ObjectId;
}

// Team Member Schema
const teamMemberSchema = new Schema<TeamMember>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: {
      type: String,
      required: true,
      enum: ["chef_equipe", "membre_equipe"],
    },
    email: { type: String, trim: true, lowercase: true },
  },
  { _id: false },
);

// Task Schema
const taskSchema = new Schema<DaoTask>(
  {
    id: { type: Number, required: true },
    name: { type: String, required: true, trim: true },
    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    comment: { type: String, trim: true },
    isApplicable: { type: Boolean, default: true },
    assignedTo: { type: String },
    lastUpdatedBy: { type: String },
    lastUpdatedAt: { type: String },
  },
  { _id: false },
);

// Main DAO Schema
const daoSchema = new Schema<DaoDocument>(
  {
    numeroListe: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    objetDossier: {
      type: String,
      required: true,
      trim: true,
    },
    reference: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    autoriteContractante: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    dateDepot: {
      type: String,
      required: true,
      validate: {
        validator: function (v: string) {
          return !isNaN(Date.parse(v));
        },
        message: "dateDepot must be a valid ISO date string",
      },
    },
    equipe: {
      type: [teamMemberSchema],
      default: [],
      validate: {
        validator: function (v: TeamMember[]) {
          // Ensure at least one chef_equipe
          return v.some((member) => member.role === "chef_equipe");
        },
        message: "At least one chef_equipe is required",
      },
    },
    tasks: {
      type: [taskSchema],
      default: [],
      validate: {
        validator: function (v: DaoTask[]) {
          // Ensure unique task IDs
          const ids = v.map((task) => task.id);
          return new Set(ids).size === ids.length;
        },
        message: "Task IDs must be unique",
      },
    },
    createdAt: {
      type: String,
      default: () => new Date().toISOString(),
    },
    updatedAt: {
      type: String,
      default: () => new Date().toISOString(),
    },
  },
  {
    timestamps: false, // We handle timestamps manually with ISO strings
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Indexes for better performance
daoSchema.index({ numeroListe: 1 });
daoSchema.index({ reference: 1 });
daoSchema.index({ autoriteContractante: 1 });
daoSchema.index({ dateDepot: 1 });
daoSchema.index({ createdAt: -1 });
daoSchema.index({ "equipe.name": 1 });

// Pre-save middleware to update timestamps
daoSchema.pre("save", function (next) {
  if (this.isModified() && !this.isNew) {
    this.updatedAt = new Date().toISOString();
  }
  next();
});

// Static methods
daoSchema.statics.findByNumeroListe = function (numeroListe: string) {
  return this.findOne({ numeroListe });
};

daoSchema.statics.findByReference = function (reference: string) {
  return this.findOne({ reference });
};

daoSchema.statics.findByAutoriteContractante = function (
  autoriteContractante: string,
) {
  return this.find({ autoriteContractante });
};

// Instance methods
daoSchema.methods.updateProgress = function (taskId: number, progress: number) {
  const task = this.tasks.find((t: DaoTask) => t.id === taskId);
  if (task) {
    task.progress = progress;
    task.lastUpdatedAt = new Date().toISOString();
    return this.save();
  }
  throw new Error(`Task with ID ${taskId} not found`);
};

daoSchema.methods.assignTask = function (taskId: number, memberId: string) {
  const task = this.tasks.find((t: DaoTask) => t.id === taskId);
  if (task) {
    task.assignedTo = memberId;
    task.lastUpdatedAt = new Date().toISOString();
    return this.save();
  }
  throw new Error(`Task with ID ${taskId} not found`);
};

export const DaoModel = mongoose.model<DaoDocument>("Dao", daoSchema);

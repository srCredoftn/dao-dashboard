/*
  Usage: This script contains ready-to-run examples for MongoDB with Mongoose.
  - It connects using MONGODB_URI (default: mongodb://localhost:27017/dao-management)
  - It showcases common queries for:
    • DAOs (listing, filtering, creation, updates, deletions)
    • Assignments (tasks assigned to team members)
    • Users and recent connections (lastLogin)

  You can run specific functions from a REPL or execute the whole file with: tsx backend-mongodb/src/scripts/db-queries.ts
  IMPORTANT: Notifications in this app are managed client-side (localStorage). This script derives “assignment notifications” from DAO/task data as an example of how a notifications collection could look like server-side.
*/

import mongoose from "mongoose";
import { DaoModel } from "../models/Dao.js";
import { UserModel } from "../models/User.js";

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/dao-management";

async function connect() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to:", mongoose.connection.name);
  }
}

async function disconnect() {
  await mongoose.disconnect();
  console.log("🔌 Disconnected");
}

// ----- DAO QUERIES -----
export async function listDaos() {
  await connect();
  const daos = await DaoModel.find().sort({ createdAt: -1 }).lean();
  console.log("📦 DAOs:", daos.length);
  return daos;
}

export async function findDaoByNumero(numeroListe: string) {
  await connect();
  const dao = await DaoModel.findOne({ numeroListe }).lean();
  console.log("🔎 DAO: ", dao?.numeroListe || "not found");
  return dao;
}

export async function listDaosForYear(year: number) {
  await connect();
  const re = new RegExp(`^DAO-${year}-\\d{3}$`);
  const daos = await DaoModel.find({ numeroListe: re })
    .sort({ createdAt: -1 })
    .lean();
  console.log(`📅 DAOs for ${year}:`, daos.length);
  return daos;
}

export async function createDao(input: {
  numeroListe: string;
  objetDossier: string;
  reference: string;
  autoriteContractante: string;
  dateDepot: string; // ISO string
  equipe: {
    id: string;
    name: string;
    role: "chef_equipe" | "membre_equipe";
    email?: string;
  }[];
  tasks: {
    id: number;
    name: string;
    isApplicable: boolean;
    progress?: number | null;
    comment?: string;
    assignedTo?: string;
  }[];
}) {
  await connect();
  const dao = await DaoModel.create({
    ...input,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  console.log("✨ Created DAO:", dao.numeroListe);
  return dao.toJSON();
}

export async function updateDao(
  numeroListe: string,
  updates: Partial<{
    objetDossier: string;
    reference: string;
    autoriteContractante: string;
    dateDepot: string;
  }>,
) {
  await connect();
  const dao = await DaoModel.findOneAndUpdate(
    { numeroListe },
    { ...updates, updatedAt: new Date().toISOString() },
    { new: true },
  ).lean();
  console.log("📝 Updated DAO:", numeroListe, Boolean(dao));
  return dao;
}

export async function deleteDao(numeroListe: string) {
  await connect();
  const res = await DaoModel.deleteOne({ numeroListe });
  console.log("🗑️ Deleted:", numeroListe, res.deletedCount);
  return res.deletedCount === 1;
}

// ----- ASSIGNMENTS (from DAO tasks) -----
export async function listAssignments() {
  await connect();
  const daos = await DaoModel.find().lean();
  const assignments = daos.flatMap((dao) =>
    dao.tasks
      .filter((t) => t.assignedTo)
      .map((t) => {
        const member = dao.equipe.find((m) => m.id === t.assignedTo);
        return {
          daoId: (dao as any).id || (dao as any)._id?.toString(),
          numeroListe: dao.numeroListe,
          taskId: t.id,
          taskName: t.name,
          assignedTo: t.assignedTo,
          assignedToName: member?.name,
          lastUpdatedAt: t.lastUpdatedAt,
        };
      }),
  );
  console.log("🧩 Assignments:", assignments.length);
  return assignments;
}

export async function assignmentsForUser(memberId: string) {
  const all = await listAssignments();
  const mine = all.filter((a) => a.assignedTo === memberId);
  console.log(`🙋 Assignments for ${memberId}:`, mine.length);
  return mine;
}

// ----- USERS & CONNECTIONS -----
export async function listUsers() {
  await connect();
  const users = await UserModel.find()
    .select("-password")
    .sort({ createdAt: -1 })
    .lean();
  console.log("👥 Users:", users.length);
  return users;
}

export async function recentConnections(limit = 10) {
  await connect();
  const users = await UserModel.find({ lastLogin: { $ne: null } })
    .select("name email role lastLogin")
    .sort({ lastLogin: -1 })
    .limit(limit)
    .lean();
  console.log("🔐 Recent logins:", users.length);
  return users;
}

// ----- DERIVED NOTIFICATIONS (from assignments) -----
export async function derivedAssignmentNotifications() {
  const items = await listAssignments();
  const notifications = items.map((a) => ({
    userId: a.assignedTo,
    title: `Nouvelle assignation: ${a.taskName}`,
    message: `Vous avez été assigné(e) à la tâche \"${a.taskName}\" pour ${a.numeroListe}`,
    createdAt: a.lastUpdatedAt || new Date().toISOString(),
    data: { daoId: a.daoId, numeroListe: a.numeroListe, taskId: a.taskId },
  }));
  console.log("🔔 Derived notifications:", notifications.length);
  return notifications;
}

// Demo runner when executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      await listDaos();
      await listUsers();
      await recentConnections(5);
      await listAssignments();
      await derivedAssignmentNotifications();
    } catch (e) {
      console.error(e);
    } finally {
      await disconnect();
    }
  })();
}

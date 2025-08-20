#!/usr/bin/env tsx
import { createServer } from "./index.js";

const app = createServer();
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Secure backend server running on port ${PORT}`);
  console.log(`🔐 Security features enabled:`);
  console.log(`  ✅ Password hashing with bcrypt`);
  console.log(`  ✅ JWT tokens with expiration`);
  console.log(`  ✅ Rate limiting`);
  console.log(`  ✅ Input validation`);
  console.log(`  ✅ CORS protection`);
  console.log(`  ✅ Helmet security headers`);
  console.log(`  ✅ Audit logging`);
  console.log(`📡 API endpoints available at http://localhost:${PORT}/api/`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🔄 SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🔄 SIGINT received, shutting down gracefully");
  process.exit(0);
});

import express, { Express, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";

import { connectDatabase, disconnectDatabase } from "./lib/prisma";
import { devAuthMiddleware, getSystemDate } from "./middleware/authMiddleware";
import { getSystemPhase } from "./utils/cycleService";
import { initializeEmailService } from "./utils/emailService";

import authRoutes from "./routes/authRoutes";
import teamRoutes from "./routes/teamRoutes";
import goalSheetRoutes from "./routes/goalSheetRoutes";
import checkInRoutes from "./routes/checkInRoutes";
import reportingRoutes from "./routes/reportingRoutes";
import escalationRoutes from "./routes/escalationRoutes";
import sharedGoalRoutes from "./routes/sharedGoalRoutes";
import userManagementRoutes from "./routes/userManagementRoutes";

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 5000;

/**
 * Global Middleware
 */
app.use(helmet());
app.use(cors());
app.use(express.json());

/**
 * Development Auth Middleware
 * Allows role and date switching via headers
 */
app.use(devAuthMiddleware);

/**
 * Health Check Endpoint
 */
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

/**
 * System Configuration Endpoint
 */
app.get("/api/system/config", (req: Request, res: Response) => {
  const systemDate = getSystemDate(req);
  const phase = getSystemPhase(systemDate);

  res.json({
    devMode: process.env.ADMIN_DEV_MODE === "true",
    systemDate: systemDate.toISOString(),
    phase,
    datePresets: [
      { label: "May 1 (Goal Creation)", value: "2026-05-01" },
      { label: "July 15 (Q1 Check-in)", value: "2026-07-15" },
      { label: "Oct 15 (Q2 Check-in)", value: "2026-10-15" },
      { label: "Jan 15 (Q3 Check-in)", value: "2027-01-15" },
      { label: "Apr 15 (Q4/Annual)", value: "2026-04-15" },
    ],
    roleOptions: [
      { label: "Employee", value: "EMPLOYEE" },
      { label: "Manager L1", value: "MANAGER" },
      { label: "Admin/HR", value: "ADMIN" },
    ],
  });
});

/**
 * Get Current User & System Date
 */
app.get("/api/auth/me", (req: Request, res: Response) => {
  res.json({
    user: req.user,
    systemDate: req.systemDate,
  });
});

/**
 * API Routes
 */
app.use("/api/auth", authRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/goal-sheets", goalSheetRoutes);
app.use("/api/check-ins", checkInRoutes);
app.use("/api/reporting", reportingRoutes);
app.use("/api/escalations", escalationRoutes);
app.use("/api/shared-goals", sharedGoalRoutes);
app.use("/api/admin/users", userManagementRoutes);

/**
 * 404 Handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: "Not Found",
    path: req.path,
  });
});

/**
 * Error Handler
 */
app.use((err: any, req: Request, res: Response) => {
  console.error("❌ Error:", err);
  res.status(500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

/**
 * Start Server
 */
async function startServer() {
  try {
    // Connect to database
    await connectDatabase();

    // Initialize email service
    await initializeEmailService();

    // Start Express server
    app.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════════════════════╗
║    Atomquest Backend Server Started                   ║
╠════════════════════════════════════════════════════════╣
║  Port: ${String(PORT).padEnd(46)} ║
║  Environment: ${(process.env.NODE_ENV || "development").padEnd(39)} ║
║  Dev Mode: ${(process.env.ADMIN_DEV_MODE === "true" ? "Enabled" : "Disabled").padEnd(42)} ║
╚════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

/**
 * Graceful Shutdown
 */
process.on("SIGTERM", async () => {
  console.log("🛑 SIGTERM received, shutting down gracefully...");
  await disconnectDatabase();
  process.exit(0);
});

// Start the server
startServer();

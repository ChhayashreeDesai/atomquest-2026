import { Router } from "express";
import {
  exportAchievementReport,
  getCompletionDashboard,
  getAdminComplianceMatrix,
  getAnalytics,
  getEmployeeProgress,
  getAuditTrail,
  getGoalSheetAuditTrail,
  clearAllCurrentGoals,
} from "../controllers/reportingController.js";
import { requireRole } from "../middleware/authMiddleware.js";

const router = Router();

// Export achievement report (CSV)
router.get("/export/achievement", requireRole("ADMIN", "MANAGER"), exportAchievementReport);

// Get completion dashboard
router.get(
  "/dashboard/completion",
  requireRole("ADMIN", "MANAGER"),
  getCompletionDashboard
);

// HR compliance matrix (quarter-gated)
router.get(
  "/admin/compliance",
  requireRole("ADMIN"),
  getAdminComplianceMatrix
);

// Get analytics (org-wide)
router.get("/analytics", requireRole("ADMIN", "MANAGER"), getAnalytics);

// Employee progress (approval-gated)
router.get("/analytics/employee", getEmployeeProgress);

// Get audit trail for goal
router.get("/audit/goal/:goalId", requireRole("ADMIN"), getAuditTrail);

// Get audit trail for goal sheet
router.get(
  "/audit/goal-sheet/:goalSheetId",
  requireRole("ADMIN", "MANAGER"),
  getGoalSheetAuditTrail
);

// Admin: Clear all current goals
router.post("/admin/clear-all-goals", requireRole("ADMIN"), clearAllCurrentGoals);

export default router;

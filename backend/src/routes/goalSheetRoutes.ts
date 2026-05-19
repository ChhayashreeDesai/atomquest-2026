import { Router } from "express";
import {
  getOrCreateGoalSheet,
  getGoalSheetHistory,
  replaceGoals,
  addGoal,
  updateGoal,
  deleteGoal,
  submitGoalSheet,
  returnGoalSheetForRework,
  approveGoalSheet,
  archiveGoalSheet,
} from "../controllers/goalSheetController.js";
import { requireRole } from "../middleware/authMiddleware.js";

const router = Router();

// History for archive selector (before parameterized routes)
router.get("/history/list", getGoalSheetHistory);

// Get or create goal sheet
router.get("/:goalSheetId?", getOrCreateGoalSheet);

// Transactional goal replace
router.put("/:goalSheetId/goals/replace", replaceGoals);

// Add goal
router.post("/:goalSheetId/goals", addGoal);

// Update goal
router.put("/goals/:goalId", updateGoal);

// Delete goal
router.delete("/goals/:goalId", deleteGoal);

// Submit for approval
router.post("/:goalSheetId/submit", submitGoalSheet);

// Manager: Return for rework
router.post("/:goalSheetId/return-for-rework", requireRole("MANAGER"), returnGoalSheetForRework);

// Manager: Approve
router.post("/:goalSheetId/approve", requireRole("MANAGER"), approveGoalSheet);

// Admin: Archive
router.post("/:goalSheetId/archive", requireRole("ADMIN"), archiveGoalSheet);

export default router;

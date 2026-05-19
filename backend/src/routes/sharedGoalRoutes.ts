import { Router } from "express";
import {
  createAndShareGoal,
  getSharedGoals,
  updateSharedGoalAchievement,
  updateSharedGoalWeightage,
  getSharedGoalStatus,
} from "../controllers/sharedGoalController.js";
import { requireRole } from "../middleware/authMiddleware.js";

const router = Router();

// Create and share goal (admin/manager only)
router.post("/:goalSheetId/create-and-share", requireRole("ADMIN", "MANAGER"), createAndShareGoal);

// Get all shared goals
router.get("/", getSharedGoals);

// Get shared goal status
router.get("/:goalId/status", getSharedGoalStatus);

// Update shared goal achievement (owner only)
router.put("/:goalId/achievement", updateSharedGoalAchievement);

// Recipient updates weightage
router.put("/:goalId/weightage", updateSharedGoalWeightage);

export default router;

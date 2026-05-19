import { Router } from "express";
import {
  addCheckInComment,
  getCheckInComments,
  getQuarterTracking,
  submitQuarterLog,
  updateGoalAchievement,
  getQuarterlyAchievementSummary,
  getTeamCheckInStatus,
  approveCheckInComment,
  requestCheckInRework,
} from "../controllers/checkInController";
import { requireRole } from "../middleware/authMiddleware";

const router = Router();

// Manager: Get team check-in status (pending approvals) - MUST be before parameterized routes
router.get("/team/check-in-status", requireRole("MANAGER"), getTeamCheckInStatus);

// Add check-in comment (Employee)
router.post("/:goalSheetId/comments", addCheckInComment);

// Get check-in comments (Employee/Manager)
router.get("/:goalSheetId/comments", getCheckInComments);

// Manager: Approve check-in comment
router.post("/:checkInCommentId/approve", requireRole("MANAGER"), approveCheckInComment);

// Manager: Request rework on check-in
router.post("/:checkInCommentId/rework", requireRole("MANAGER"), requestCheckInRework);

// Update goal achievement (Employee)
router.put("/:goalId/achievement", updateGoalAchievement);

// Get quarterly summary (alias for frontend compatibility)
router.get("/:goalSheetId/summary", getQuarterlyAchievementSummary);
router.get("/:goalSheetId/quarterly-summary", getQuarterlyAchievementSummary);

// Quarter-isolated tracking
router.get("/:goalSheetId/quarters/:quarter", getQuarterTracking);
router.post("/:goalSheetId/quarters/:quarter/submit", submitQuarterLog);

// Legacy team status alias
router.get("/team-status", requireRole("MANAGER"), getTeamCheckInStatus);

export default router;

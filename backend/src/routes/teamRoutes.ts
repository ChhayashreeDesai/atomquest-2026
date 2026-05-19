import { Router } from "express";
import {
  getTeamMembers,
  getGoalSheetForReview,
  getTeamMemberQuarterReview,
} from "../controllers/teamController.js";
import { requireRole } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/members", requireRole("MANAGER", "ADMIN"), getTeamMembers);

router.get(
  "/members/:employeeId/quarter-review",
  requireRole("MANAGER"),
  getTeamMemberQuarterReview
);

router.get("/:goalSheetId/review", requireRole("MANAGER"), getGoalSheetForReview);

export default router;

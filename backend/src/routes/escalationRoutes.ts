import { Router } from "express";
import {
  evaluateEscalationRules,
  getEscalations,
  resolveEscalation,
  getHREscalationPanel,
} from "../controllers/escalationController";
import { requireRole } from "../middleware/authMiddleware";

const router = Router();

// Evaluate escalation rules (admin trigger)
router.post("/evaluate", requireRole("ADMIN"), evaluateEscalationRules);

// Get escalations for current user
router.get("/", getEscalations);

// Resolve escalation
router.post("/:escalationId/resolve", resolveEscalation);

// HR escalation panel
router.get("/hr/panel", requireRole("ADMIN"), getHREscalationPanel);

export default router;

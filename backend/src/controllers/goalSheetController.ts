import { Request, Response } from "express";
import { UoMType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { validateWeightage } from "../utils/calculationEngine.js";
import {
  ensureActiveGoalSheet,
  listGoalSheetHistory,
  deriveFiscalYear,
  deriveCycleYear,
} from "../utils/cycleService.js";
import { getSystemDate } from "../middleware/authMiddleware.js";
import { normalizeThrustArea } from "../utils/thrustAreaMapper.js";
import {
  sendEmail,
  generateEmailTemplate,
} from "../utils/emailService.js";

const goalSheetInclude = {
  goals: { include: { quarterlyEntries: true }, orderBy: { createdAt: "asc" as const } },
  checkInComments: true,
  user: true,
};

async function ensureUserExists(req: Request, userId: string) {
  const userExists = await prisma.user.findUnique({ where: { id: userId } });
  if (!userExists) {
    await prisma.user.create({
      data: {
        id: userId,
        email: req.user?.email || "emp1@atomquest.dev",
        name: req.user?.name || "Alice Johnson",
        role: req.user?.role || "EMPLOYEE",
        managerId: null,
      },
    });
  }
}

/**
 * Get or create goal sheet for current user (respects fiscal year & cycle rollover)
 */
export async function getOrCreateGoalSheet(req: Request, res: Response) {
  try {
    const userId = req.user?.id || "emp-001";
    const systemDate = getSystemDate(req);
    const fiscalYearQuery = req.query.fiscalYear as string | undefined;
    const fiscalYear = fiscalYearQuery || deriveFiscalYear(systemDate);

    await ensureUserExists(req, userId);

    if (fiscalYearQuery) {
      const historical = await prisma.goalSheet.findUnique({
        where: { userId_fiscalYear: { userId, fiscalYear } },
        include: goalSheetInclude,
      });
      if (!historical) {
        return res.status(404).json({ error: "Goal sheet not found for fiscal year" });
      }
      return res.json(historical);
    }

    const goalSheet = await ensureActiveGoalSheet(userId, systemDate);
    if (!goalSheet) {
      return res.status(404).json({
        error: "No active goal sheet. Goal creation opens in the May window.",
        fiscalYear,
      });
    }

    return res.json(goalSheet);
  } catch (error) {
    console.error("Error fetching goal sheet:", error);
    return res.status(500).json({ error: "Failed to fetch goal sheet" });
  }
}

/**
 * List fiscal-year history for archive selector
 */
export async function getGoalSheetHistory(req: Request, res: Response) {
  try {
    const userId = req.user?.id || "emp-001";
    const history = await listGoalSheetHistory(userId);
    return res.json(history);
  } catch (error) {
    console.error("Error fetching goal sheet history:", error);
    return res.status(500).json({ error: "Failed to fetch history" });
  }
}

/**
 * Replace all goals in a transaction (duplication patch)
 */
export async function replaceGoals(req: Request, res: Response) {
  try {
    const { goalSheetId } = req.params;
    const { goals } = req.body;

    if (!Array.isArray(goals) || goals.length === 0) {
      return res.status(400).json({ error: "At least one goal is required" });
    }
    if (goals.length > 8) {
      return res.status(400).json({ error: "Maximum 8 goals allowed" });
    }

    const goalSheet = await prisma.goalSheet.findUnique({
      where: { id: goalSheetId },
      include: { goals: true },
    });

    if (!goalSheet) {
      return res.status(404).json({ error: "Goal sheet not found" });
    }

    if (goalSheet.userId !== req.user?.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (goalSheet.status === "LOCKED" || goalSheet.status === "ARCHIVED") {
      return res.status(400).json({ error: "Goal sheet is read-only" });
    }

    if (goalSheet.status === "SUBMITTED") {
      return res.status(400).json({ error: "Goal sheet is awaiting review" });
    }

    const weightages = goals.map((g: { weightage: number }) => Number(g.weightage));
    const validation = validateWeightage(weightages);
    if (!validation.isValid) {
      return res.status(400).json({ errors: validation.errors });
    }

    const normalizedGoals = goals.map(
      (g: {
        thrustArea: string;
        title: string;
        description: string;
        uomType: string;
        targetValue: string | number;
        weightage: number;
      }) => ({
        thrustArea: normalizeThrustArea(g.thrustArea),
        title: String(g.title).trim(),
        description: String(g.description).trim(),
        uomType: g.uomType as UoMType,
        targetValue: String(g.targetValue),
        weightage: Number(g.weightage),
        completionStatus: "NOT_STARTED" as const,
      })
    );

    const updated = await prisma.$transaction(async (tx) => {
      await tx.goal.deleteMany({ where: { goalSheetId } });
      await tx.goal.createMany({
        data: normalizedGoals.map((g) => ({ ...g, goalSheetId })),
      });
      return tx.goalSheet.findUnique({
        where: { id: goalSheetId },
        include: goalSheetInclude,
      });
    });

    return res.json(updated);
  } catch (error) {
    console.error("Error replacing goals:", error);
    return res.status(500).json({ error: "Failed to replace goals" });
  }
}

/**
 * Add goal to goal sheet
 */
export async function addGoal(req: Request, res: Response) {
  try {
    const { goalSheetId } = req.params;
    const {
      thrustArea,
      title,
      description,
      uomType,
      targetValue,
      weightage,
    } = req.body;

    if (!thrustArea || !title || !description || !uomType || !targetValue) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const goalSheet = await prisma.goalSheet.findUnique({
      where: { id: goalSheetId },
      include: { goals: true },
    });

    if (!goalSheet) {
      return res.status(404).json({ error: "Goal sheet not found" });
    }

    if (goalSheet.userId !== req.user?.id) {
      return res.status(403).json({ error: "Forbidden: You can only add goals to your own goal sheet" });
    }

    if (goalSheet.status !== "DRAFT") {
      return res.status(400).json({ error: "Goals can only be added in DRAFT state" });
    }

    if (goalSheet.goals.length >= 8) {
      return res.status(400).json({ error: "Maximum 8 goals allowed" });
    }

    const goal = await prisma.goal.create({
      data: {
        goalSheetId,
        thrustArea: normalizeThrustArea(thrustArea),
        title,
        description,
        uomType,
        targetValue: String(targetValue),
        weightage: Number(weightage) || 0,
        completionStatus: "NOT_STARTED",
      },
    });

    res.status(201).json(goal);
  } catch (error) {
    console.error("Error adding goal:", error);
    res.status(500).json({ error: "Failed to add goal" });
  }
}

export async function updateGoal(req: Request, res: Response) {
  try {
    const { goalId } = req.params;
    const updates = { ...req.body };
    if (updates.thrustArea) {
      updates.thrustArea = normalizeThrustArea(updates.thrustArea);
    }

    const goal = await prisma.goal.findUnique({
      where: { id: goalId },
      include: { goalSheet: true },
    });

    if (!goal) {
      return res.status(404).json({ error: "Goal not found" });
    }

    if (goal.goalSheet.status === "LOCKED" || goal.goalSheet.status === "ARCHIVED") {
      return res.status(400).json({ error: "Goal sheet is locked. Cannot edit." });
    }

    if (req.user?.role === "EMPLOYEE") {
      if (goal.goalSheet.userId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden: You can only edit your own goals" });
      }
      if (goal.goalSheet.status !== "DRAFT") {
        return res.status(400).json({ error: "You can only edit goals in DRAFT state" });
      }
    }

    if (goal.goalSheet.status === "SUBMITTED" && req.user?.role === "MANAGER") {
      await prisma.auditLog.create({
        data: {
          goalId,
          goalSheetId: goal.goalSheetId,
          changedByUserId: req.user.id,
          oldValue: JSON.stringify({ weightage: goal.weightage }),
          newValue: JSON.stringify(updates),
          actionTaken: "MANAGER_EDIT_DURING_REVIEW",
        },
      });
    }

    const updatedGoal = await prisma.goal.update({
      where: { id: goalId },
      data: updates,
    });

    res.json(updatedGoal);
  } catch (error) {
    console.error("Error updating goal:", error);
    res.status(500).json({ error: "Failed to update goal" });
  }
}

export async function deleteGoal(req: Request, res: Response) {
  try {
    const { goalId } = req.params;

    const goal = await prisma.goal.findUnique({
      where: { id: goalId },
      include: { goalSheet: true },
    });

    if (!goal) {
      return res.status(404).json({ error: "Goal not found" });
    }

    if (goal.goalSheet.status === "LOCKED" || goal.goalSheet.status === "ARCHIVED") {
      return res.status(400).json({ error: "Cannot delete from locked goal sheet" });
    }

    if (goal.goalSheet.userId !== req.user?.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (goal.goalSheet.status !== "DRAFT") {
      return res.status(400).json({ error: "Can only delete goals in DRAFT state" });
    }

    await prisma.goal.delete({ where: { id: goalId } });
    res.json({ message: "Goal deleted successfully" });
  } catch (error) {
    console.error("Error deleting goal:", error);
    res.status(500).json({ error: "Failed to delete goal" });
  }
}

export async function submitGoalSheet(req: Request, res: Response) {
  try {
    const { goalSheetId } = req.params;

    const goalSheet = await prisma.goalSheet.findUnique({
      where: { id: goalSheetId },
      include: { goals: true, user: true },
    });

    if (!goalSheet) {
      return res.status(404).json({ error: "Goal sheet not found" });
    }

    if (goalSheet.userId !== req.user?.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (goalSheet.status === "ARCHIVED") {
      return res.status(400).json({ error: "Archived goal sheets cannot be submitted" });
    }

    if (goalSheet.goals.length === 0) {
      return res.status(400).json({ error: "Add at least one goal before submitting" });
    }

    const weightages = goalSheet.goals.map((g) => g.weightage);
    const validation = validateWeightage(weightages);
    if (!validation.isValid) {
      return res.status(400).json({ errors: validation.errors });
    }

    const updated = await prisma.goalSheet.update({
      where: { id: goalSheetId },
      data: { status: "SUBMITTED" },
      include: goalSheetInclude,
    });

    try {
      await sendEmail({
        to: goalSheet.user.email,
        subject: "Your Goal Sheet Has Been Submitted",
        htmlBody: generateEmailTemplate("GOAL_SUBMISSION", {
          userName: goalSheet.user.name,
          cycleYear: goalSheet.fiscalYear,
          goalCount: goalSheet.goals.length,
        }),
        type: "GOAL_SUBMISSION",
      });
    } catch (emailError) {
      console.error("Email send failed (non-blocking):", emailError);
    }

    res.json(updated);
  } catch (error) {
    console.error("Error submitting goal sheet:", error);
    res.status(500).json({ error: "Failed to submit goal sheet" });
  }
}

export async function returnGoalSheetForRework(req: Request, res: Response) {
  try {
    const { goalSheetId } = req.params;
    const { comments } = req.body;

    const goalSheet = await prisma.goalSheet.findUnique({
      where: { id: goalSheetId },
      include: { user: true },
    });

    if (!goalSheet) {
      return res.status(404).json({ error: "Goal sheet not found" });
    }

    if (goalSheet.user.managerId !== req.user?.id) {
      return res.status(403).json({ error: "Forbidden: Not your team member" });
    }

    const updated = await prisma.goalSheet.update({
      where: { id: goalSheetId },
      data: {
        status: "DRAFT",
        managerFeedback: comments || "Please revise your goals and resubmit.",
      },
      include: goalSheetInclude,
    });

    try {
      await sendEmail({
        to: goalSheet.user.email,
        subject: "Your Goal Sheet Requires Rework",
        htmlBody: generateEmailTemplate("GOAL_REJECTION", {
          userName: goalSheet.user.name,
          cycleYear: goalSheet.fiscalYear,
          managerName: req.user?.name,
          comments,
        }),
        type: "GOAL_REJECTION",
      });
    } catch (emailError) {
      console.error("Email send failed (non-blocking):", emailError);
    }

    res.json(updated);
  } catch (error) {
    console.error("Error returning goal sheet:", error);
    res.status(500).json({ error: "Failed to return goal sheet" });
  }
}

export async function approveGoalSheet(req: Request, res: Response) {
  try {
    const { goalSheetId } = req.params;

    const goalSheet = await prisma.goalSheet.findUnique({
      where: { id: goalSheetId },
      include: { goals: true, user: true },
    });

    if (!goalSheet) {
      return res.status(404).json({ error: "Goal sheet not found" });
    }

    if (goalSheet.user.managerId !== req.user?.id) {
      return res.status(403).json({ error: "Forbidden: Not your team member" });
    }

    const weightages = goalSheet.goals.map((g) => g.weightage);
    const validation = validateWeightage(weightages);
    if (!validation.isValid) {
      return res.status(400).json({ errors: validation.errors });
    }

    const updated = await prisma.goalSheet.update({
      where: { id: goalSheetId },
      data: { status: "LOCKED" },
      include: goalSheetInclude,
    });

    try {
      await sendEmail({
        to: goalSheet.user.email,
        subject: "Your Goal Sheet Has Been Approved",
        htmlBody: generateEmailTemplate("GOAL_APPROVAL", {
          userName: goalSheet.user.name,
          cycleYear: goalSheet.fiscalYear,
          approverName: req.user?.name,
        }),
        type: "GOAL_APPROVAL",
      });
    } catch (emailError) {
      console.error("Email send failed (non-blocking):", emailError);
    }

    res.json(updated);
  } catch (error) {
    console.error("Error approving goal sheet:", error);
    res.status(500).json({ error: "Failed to approve goal sheet" });
  }
}

/**
 * Admin: Archive goal sheet (annual review phase)
 * Marks goals as complete and moves them to past years, allowing new goals to be created
 */
export async function archiveGoalSheet(req: Request, res: Response) {
  try {
    const { goalSheetId } = req.params;

    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Only admins can archive goals" });
    }

    const goalSheet = await prisma.goalSheet.findUnique({
      where: { id: goalSheetId },
      include: { goals: true, user: true },
    });

    if (!goalSheet) {
      return res.status(404).json({ error: "Goal sheet not found" });
    }

    if (goalSheet.status !== "LOCKED") {
      return res.status(400).json({ error: "Only locked goal sheets can be archived" });
    }

    // If archiving a goal sheet that belongs to the current fiscal year,
    // move the archived sheet into the previous fiscal year (so it appears
    // under "Past Years") and create a fresh active DRAFT sheet for the
    // current fiscal year so employees can immediately create new goals.
    const systemDate = getSystemDate(req);
    const currentFiscalYear = deriveFiscalYear(systemDate);

    const result = await prisma.$transaction(async (tx) => {
      // Default: mark the sheet archived and inactive
      let archived = await tx.goalSheet.update({
        where: { id: goalSheetId },
        data: {
          status: "ARCHIVED",
          isActive: false,
          managerFeedback: null,
        },
        include: goalSheetInclude,
      });

      // If this sheet belongs to the current fiscal year, move it to previous
      // fiscal year so it shows up under Past Years and does not block a new
      // active sheet for the current cycle.
      if (archived.fiscalYear === currentFiscalYear) {
        // Compute previous fiscal year string (e.g. "2025-2026" -> "2024-2025")
        const parts = archived.fiscalYear.split("-");
        const prevFy = `${Number(parts[0]) - 1}-${Number(parts[1]) - 1}`;

        archived = await tx.goalSheet.update({
          where: { id: goalSheetId },
          data: { fiscalYear: prevFy },
          include: goalSheetInclude,
        });

        // Create a fresh active goal sheet for the current fiscal year
        // only if one does not already exist for the user
        const existing = await tx.goalSheet.findUnique({
          where: { userId_fiscalYear: { userId: archived.userId, fiscalYear: currentFiscalYear } },
        });

        if (!existing) {
          await tx.goalSheet.create({
            data: {
              userId: archived.userId,
              fiscalYear: currentFiscalYear,
              cycleYear: deriveCycleYear(systemDate),
              quarter: "ANNUAL",
              status: "DRAFT",
              isActive: true,
            },
          });
        } else {
          // If an existing active sheet exists already, ensure it's active
          await tx.goalSheet.update({
            where: { id: existing.id },
            data: { isActive: true, status: existing.status || "DRAFT" },
          });
        }
      }

      return archived;
    });

    res.json({ ...result, message: "Archived and unlocked new goal creation." });
  } catch (error) {
    console.error("Error archiving goal sheet:", error);
    res.status(500).json({ error: "Failed to archive goal sheet" });
  }
}

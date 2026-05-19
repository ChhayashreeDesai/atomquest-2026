import { Request, Response } from "express";
import { Quarter } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { calculateProgressScore } from "../utils/calculationEngine";
import { getSystemDate } from "../middleware/authMiddleware";

const VALID_QUARTERS: Quarter[] = ["Q1", "Q2", "Q3", "Q4"];

function parseQuarter(value: string): Quarter | null {
  if (VALID_QUARTERS.includes(value as Quarter)) {
    return value as Quarter;
  }
  return null;
}

/**
 * Get quarter-specific tracking data (frozen baselines + editable entries)
 */
export async function getQuarterTracking(req: Request, res: Response) {
  try {
    const { goalSheetId, quarter: quarterParam } = req.params;
    const quarter = parseQuarter(quarterParam);

    if (!quarter) {
      return res.status(400).json({ error: "Invalid quarter" });
    }

    const goalSheet = await prisma.goalSheet.findUnique({
      where: { id: goalSheetId },
      include: {
        goals: { include: { quarterlyEntries: true } },
        checkInComments: { where: { quarter } },
        user: true,
      },
    });

    if (!goalSheet) {
      return res.status(404).json({ error: "Goal sheet not found" });
    }

    if (req.user?.role === "EMPLOYEE" && goalSheet.userId !== req.user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const quarterComment = goalSheet.checkInComments[0] || null;
    const isSubmitted =
      quarterComment?.approvalStatus === "PENDING" ||
      quarterComment?.approvalStatus === "APPROVED" ||
      goalSheet.goals.some((g) =>
        g.quarterlyEntries.some((e) => e.quarter === quarter && e.isSubmitted)
      );

    const goals = goalSheet.goals.map((goal) => {
      const entry = goal.quarterlyEntries.find((e) => e.quarter === quarter);
      return {
        id: goal.id,
        title: goal.title,
        description: goal.description,
        uomType: goal.uomType,
        targetValue: goal.targetValue,
        weightage: goal.weightage,
        actualAchievement: entry?.actualAchievement ?? "",
        progressScore: entry?.progressScore ?? 0,
        completionStatus: entry?.completionStatus ?? "NOT_STARTED",
        isSubmitted: entry?.isSubmitted ?? false,
      };
    });

    res.json({
      quarter,
      goalSheetId,
      goalSheetStatus: goalSheet.status,
      isReadOnly:
        goalSheet.status === "ARCHIVED" ||
        isSubmitted ||
        quarterComment?.approvalStatus === "PENDING" ||
        quarterComment?.approvalStatus === "APPROVED",
      approvalStatus: quarterComment?.approvalStatus ?? null,
      managerFeedback:
        quarterComment?.approvalStatus === "REWORK_REQUESTED"
          ? quarterComment.reworkComments || quarterComment.managerComments
          : null,
      goals,
    });
  } catch (error) {
    console.error("Error fetching quarter tracking:", error);
    res.status(500).json({ error: "Failed to fetch quarter tracking" });
  }
}

/**
 * Submit quarterly performance log (freezes quarter inputs)
 */
export async function submitQuarterLog(req: Request, res: Response) {
  try {
    const { goalSheetId, quarter: quarterParam } = req.params;
    const { entries, commentText } = req.body;
    const quarter = parseQuarter(quarterParam);

    if (!quarter) {
      return res.status(400).json({ error: "Invalid quarter" });
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: "At least one goal entry is required" });
    }

    const goalSheet = await prisma.goalSheet.findUnique({
      where: { id: goalSheetId },
      include: { goals: true, checkInComments: { where: { quarter } } },
    });

    if (!goalSheet) {
      return res.status(404).json({ error: "Goal sheet not found" });
    }

    if (goalSheet.userId !== req.user?.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (goalSheet.status !== "LOCKED") {
      return res.status(400).json({
        error: "Goal sheet must be locked/approved before submitting achievements",
      });
    }

    // Allow resubmission after rework - delete old REWORK_REQUESTED comment first
    const existingRework = goalSheet.checkInComments.find(
      (c) => c.approvalStatus === "REWORK_REQUESTED"
    );
    if (existingRework) {
      await prisma.checkInComment.delete({
        where: { id: existingRework.id },
      });
    }

    const existingPending = goalSheet.checkInComments.find(
      (c) => c.approvalStatus === "PENDING" || c.approvalStatus === "APPROVED"
    );
    if (existingPending) {
      return res.status(400).json({
        error: `${quarter} log already submitted and pending or approved`,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      for (const entry of entries) {
        const goal = goalSheet.goals.find((g) => g.id === entry.goalId);
        if (!goal) continue;

        const progressScore = calculateProgressScore(
          goal.uomType,
          goal.targetValue,
          entry.actualAchievement
        );

        await tx.goalQuarterlyEntry.upsert({
          where: {
            goalId_quarter: { goalId: entry.goalId, quarter },
          },
          create: {
            goalId: entry.goalId,
            quarter,
            actualAchievement: String(entry.actualAchievement ?? ""),
            progressScore,
            completionStatus: entry.completionStatus || "NOT_STARTED",
            isSubmitted: true,
            submittedAt: new Date(),
          },
          update: {
            actualAchievement: String(entry.actualAchievement ?? ""),
            progressScore,
            completionStatus: entry.completionStatus || "NOT_STARTED",
            isSubmitted: true,
            submittedAt: new Date(),
          },
        });
      }

      const comment = await tx.checkInComment.create({
        data: {
          goalSheetId,
          quarter,
          commentText:
            commentText ||
            `Submitted performance metrics for ${quarter} evaluation.`,
          createdByUserId: req.user?.id || "emp-001",
          approvalStatus: "PENDING",
        },
        include: { createdBy: true, approvedBy: true },
      });

      return comment;
    });

    res.status(201).json(result);
  } catch (error) {
    console.error("Error submitting quarter log:", error);
    res.status(500).json({ error: "Failed to submit quarter log" });
  }
}

export async function addCheckInComment(req: Request, res: Response) {
  try {
    const { goalSheetId } = req.params;
    const { quarter, commentText } = req.body;

    if (!quarter || !commentText) {
      return res.status(400).json({ error: "Quarter and comment text are required" });
    }

    const goalSheet = await prisma.goalSheet.findUnique({
      where: { id: goalSheetId },
      include: { user: true },
    });

    if (!goalSheet) {
      return res.status(404).json({ error: "Goal sheet not found" });
    }

    if (goalSheet.userId !== req.user?.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (goalSheet.status !== "LOCKED") {
      return res.status(400).json({
        error: "Goal sheet must be locked/approved before submitting achievements",
      });
    }

    const comment = await prisma.checkInComment.create({
      data: {
        goalSheetId,
        quarter,
        commentText,
        createdByUserId: req.user?.id || "emp-001",
        approvalStatus: "PENDING",
      },
      include: { createdBy: true, approvedBy: true },
    });

    res.status(201).json(comment);
  } catch (error) {
    console.error("Error adding check-in comment:", error);
    res.status(500).json({ error: "Failed to add check-in comment" });
  }
}

export async function getCheckInComments(req: Request, res: Response) {
  try {
    const { goalSheetId } = req.params;
    const quarterFilter = req.query.quarter as string | undefined;

    const goalSheet = await prisma.goalSheet.findUnique({
      where: { id: goalSheetId },
      include: { user: true },
    });

    if (!goalSheet) {
      return res.status(404).json({ error: "Goal sheet not found" });
    }

    if (req.user?.role === "EMPLOYEE" && goalSheet.userId !== req.user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (req.user?.role === "MANAGER") {
      if (goalSheet.user.managerId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    const comments = await prisma.checkInComment.findMany({
      where: {
        goalSheetId,
        ...(quarterFilter ? { quarter: quarterFilter as Quarter } : {}),
      },
      include: { createdBy: true, approvedBy: true },
      orderBy: { timestamp: "desc" },
    });

    res.json(comments);
  } catch (error) {
    console.error("Error fetching check-in comments:", error);
    res.status(500).json({ error: "Failed to fetch check-in comments" });
  }
}

export async function approveCheckInComment(req: Request, res: Response) {
  try {
    const { checkInCommentId } = req.params;
    const { managerComments } = req.body || {};

    if (!managerComments || !String(managerComments).trim()) {
      return res.status(400).json({ error: "Manager check-in comments are required" });
    }

    if (req.user?.role !== "MANAGER") {
      return res.status(403).json({ error: "Only managers can approve achievements" });
    }

    const comment = await prisma.checkInComment.findUnique({
      where: { id: checkInCommentId },
      include: { goalSheet: { include: { user: true } } },
    });

    if (!comment) {
      return res.status(404).json({ error: "Check-in comment not found" });
    }

    if (comment.goalSheet.user.managerId !== req.user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const approved = await prisma.checkInComment.update({
      where: { id: checkInCommentId },
      data: {
        approvalStatus: "APPROVED",
        approvedByUserId: req.user.id,
        approvalTimestamp: new Date(),
        managerComments: String(managerComments).trim(),
        reworkRequested: false,
      },
      include: { createdBy: true, approvedBy: true },
    });

    res.json(approved);
  } catch (error) {
    console.error("Error approving check-in comment:", error);
    res.status(500).json({ error: "Failed to approve check-in comment" });
  }
}

export async function requestCheckInRework(req: Request, res: Response) {
  try {
    const { checkInCommentId } = req.params;
    const { reworkComments, managerComments } = req.body || {};
    const feedback = reworkComments || managerComments;

    if (!feedback || !String(feedback).trim()) {
      return res.status(400).json({ error: "Manager check-in comments are required" });
    }

    if (req.user?.role !== "MANAGER") {
      return res.status(403).json({ error: "Only managers can request rework" });
    }

    const comment = await prisma.checkInComment.findUnique({
      where: { id: checkInCommentId },
      include: { goalSheet: { include: { user: true } } },
    });

    if (!comment) {
      return res.status(404).json({ error: "Check-in comment not found" });
    }

    if (comment.goalSheet.user.managerId !== req.user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.checkInComment.update({
        where: { id: checkInCommentId },
        data: {
          approvalStatus: "REWORK_REQUESTED",
          reworkRequested: true,
          reworkComments: String(feedback).trim(),
          managerComments: String(feedback).trim(),
        },
      });

      await tx.goalQuarterlyEntry.updateMany({
        where: {
          goal: { goalSheetId: comment.goalSheetId },
          quarter: comment.quarter,
        },
        data: { isSubmitted: false, submittedAt: null },
      });
    });

    const updated = await prisma.checkInComment.findUnique({
      where: { id: checkInCommentId },
      include: { createdBy: true },
    });

    res.json(updated);
  } catch (error) {
    console.error("Error requesting rework:", error);
    res.status(500).json({ error: "Failed to request rework" });
  }
}

/**
 * Update goal achievement for a specific quarter (draft, before submit)
 */
export async function updateGoalAchievement(req: Request, res: Response) {
  try {
    const { goalId } = req.params;
    const { actualAchievement, completionStatus, quarter } = req.body;

    if (!quarter) {
      return res.status(400).json({ error: "Quarter is required" });
    }

    const quarterEnum = parseQuarter(quarter);
    if (!quarterEnum) {
      return res.status(400).json({ error: "Invalid quarter" });
    }

    const goal = await prisma.goal.findUnique({
      where: { id: goalId },
      include: {
        goalSheet: { include: { checkInComments: { where: { quarter: quarterEnum } } } },
        quarterlyEntries: { where: { quarter: quarterEnum } },
      },
    });

    if (!goal) {
      return res.status(404).json({ error: "Goal not found" });
    }

    if (goal.goalSheet.userId !== req.user?.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (goal.goalSheet.status !== "LOCKED") {
      return res.status(400).json({ error: "Goal sheet must be locked for tracking" });
    }

    const quarterComment = goal.goalSheet.checkInComments[0];
    if (
      quarterComment?.approvalStatus === "PENDING" ||
      quarterComment?.approvalStatus === "APPROVED"
    ) {
      return res.status(400).json({ error: "Quarter log is frozen pending manager review" });
    }

    const existingEntry = goal.quarterlyEntries[0];
    if (existingEntry?.isSubmitted) {
      return res.status(400).json({ error: "Quarter log already submitted" });
    }

    const progressScore = calculateProgressScore(
      goal.uomType,
      goal.targetValue,
      actualAchievement
    );

    const updated = await prisma.goalQuarterlyEntry.upsert({
      where: {
        goalId_quarter: { goalId, quarter: quarterEnum },
      },
      create: {
        goalId,
        quarter: quarterEnum,
        actualAchievement: String(actualAchievement ?? ""),
        progressScore,
        completionStatus: completionStatus || "NOT_STARTED",
      },
      update: {
        actualAchievement: String(actualAchievement ?? ""),
        progressScore,
        completionStatus: completionStatus || "NOT_STARTED",
      },
    });

    res.json(updated);
  } catch (error) {
    console.error("Error updating achievement:", error);
    res.status(500).json({ error: "Failed to update achievement" });
  }
}

export async function getQuarterlyAchievementSummary(req: Request, res: Response) {
  try {
    const { goalSheetId } = req.params;
    const quarter = (req.query.quarter as string) || "Q1";
    const quarterEnum = parseQuarter(quarter);

    if (!quarterEnum) {
      return res.status(400).json({ error: "Invalid quarter" });
    }

    const goalSheet = await prisma.goalSheet.findUnique({
      where: { id: goalSheetId },
      include: {
        goals: { include: { quarterlyEntries: { where: { quarter: quarterEnum } } } },
        checkInComments: { where: { quarter: quarterEnum } },
        user: true,
      },
    });

    if (!goalSheet) {
      return res.status(404).json({ error: "Goal sheet not found" });
    }

    if (req.user?.role === "EMPLOYEE" && goalSheet.userId !== req.user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (req.user?.role === "MANAGER" && goalSheet.user.managerId !== req.user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const quarterComment = goalSheet.checkInComments[0];
    const showMetrics =
      req.user?.role === "MANAGER" ||
      quarterComment?.approvalStatus === "APPROVED";

    const goals = goalSheet.goals.map((g) => {
      const entry = g.quarterlyEntries[0];
      return {
        id: g.id,
        title: g.title,
        targetValue: g.targetValue,
        actualAchievement: showMetrics ? entry?.actualAchievement : null,
        progressScore: showMetrics ? entry?.progressScore : null,
        completionStatus: showMetrics ? entry?.completionStatus : null,
        weightage: g.weightage,
        pendingEvaluation: !showMetrics && entry?.isSubmitted,
      };
    });

    const summary = {
      quarter,
      approvalStatus: quarterComment?.approvalStatus ?? null,
      totalGoals: goalSheet.goals.length,
      goalsWithAchievement: goals.filter((g) => g.actualAchievement).length,
      averageProgress: showMetrics
        ? goalSheet.goals.length > 0
          ? (
              goals.reduce((sum, g) => sum + (g.progressScore || 0), 0) /
              goalSheet.goals.length
            ).toFixed(2)
          : 0
        : null,
      goals,
    };

    res.json(summary);
  } catch (error) {
    console.error("Error fetching achievement summary:", error);
    res.status(500).json({ error: "Failed to fetch achievement summary" });
  }
}

export async function getTeamCheckInStatus(req: Request, res: Response) {
  try {
    if (req.user?.role !== "MANAGER") {
      return res.status(403).json({ error: "Only managers can view team check-in status" });
    }

    const pendingCheckIns = await prisma.checkInComment.findMany({
      where: {
        goalSheet: { user: { managerId: req.user.id } },
        approvalStatus: "PENDING",
      },
      include: {
        goalSheet: { include: { user: true } },
        createdBy: true,
        approvedBy: true,
      },
      orderBy: { timestamp: "desc" },
    });

    const checkIns = pendingCheckIns.map((comment) => ({
      id: comment.id,
      commentText: comment.commentText,
      quarter: comment.quarter,
      createdAt: comment.timestamp,
      approvalStatus: comment.approvalStatus,
      goalSheet: {
        userId: comment.goalSheet.userId,
        user: {
          id: comment.goalSheet.user.id,
          name: comment.goalSheet.user.name,
          email: comment.goalSheet.user.email,
        },
      },
    }));

    res.json({ checkIns });
  } catch (error) {
    console.error("Error fetching team check-in status:", error);
    res.status(500).json({ error: "Failed to fetch team check-in status" });
  }
}

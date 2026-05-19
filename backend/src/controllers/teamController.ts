import { Request, Response } from "express";
import { Quarter } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { getSystemDate } from "../middleware/authMiddleware";
import { deriveFiscalYear, getSystemPhase } from "../utils/cycleService";
import { thrustAreaToLabel } from "../utils/thrustAreaMapper";

export async function getTeamMembers(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const systemDate = getSystemDate(req);
    const fiscalYear = deriveFiscalYear(systemDate);
    const phaseInfo = getSystemPhase(systemDate);
    const activeQuarter = phaseInfo.activeQuarter;

    const teamMembers = await prisma.user.findMany({
      where: { managerId: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        goalSheets: {
          where: { fiscalYear, isActive: true },
          select: {
            id: true,
            status: true,
            fiscalYear: true,
            goals: {
              select: {
                id: true,
                quarterlyEntries: activeQuarter
                  ? { where: { quarter: activeQuarter as Quarter }, select: { isSubmitted: true } }
                  : { select: { isSubmitted: true } },
              },
            },
            checkInComments: activeQuarter
              ? { where: { quarter: activeQuarter as Quarter }, select: { id: true, approvalStatus: true } }
              : { select: { id: true, approvalStatus: true } },
          },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    });

    const members = teamMembers.map((member) => {
      const sheet = member.goalSheets[0];
      // Since we filtered checkInComments by quarter in the query, just take the first one if it exists
      const quarterComment = activeQuarter && sheet?.checkInComments.length > 0
        ? sheet.checkInComments[0]
        : null;

      let quarterStatus = "NOT_APPLICABLE";
      if (activeQuarter && sheet?.status === "LOCKED") {
        if (quarterComment) {
          quarterStatus = quarterComment.approvalStatus;
        } else {
          const hasSubmitted = sheet.goals.some((g) =>
            g.quarterlyEntries.some((e) => e.isSubmitted)
          );
          quarterStatus = hasSubmitted ? "DRAFT" : "NOT_SUBMITTED";
        }
      }

      return {
        id: member.id,
        name: member.name,
        email: member.email,
        goalSheetStatus: sheet?.status || "NO_SHEET",
        goalSheetId: sheet?.id || null,
        fiscalYear: sheet?.fiscalYear || fiscalYear,
        activeQuarter,
        quarterStatus,
        quarterLabel: activeQuarter
          ? `${activeQuarter} — ${formatQuarterStatus(quarterStatus)}`
          : null,
      };
    });

    res.json({
      phase: phaseInfo.phase,
      activeQuarter,
      fiscalYear,
      members,
    });
  } catch (error) {
    console.error("Error fetching team members:", error);
    res.status(500).json({ error: "Failed to fetch team members" });
  }
}

function formatQuarterStatus(status: string): string {
  switch (status) {
    case "PENDING":
      return "Submitted";
    case "APPROVED":
      return "Approved";
    case "REWORK_REQUESTED":
      return "Rework";
    case "NOT_SUBMITTED":
      return "Not submitted";
    case "DRAFT":
      return "Draft";
    default:
      return status;
  }
}

export async function getGoalSheetForReview(req: Request, res: Response) {
  try {
    const { goalSheetId } = req.params;

    const goalSheet = await prisma.goalSheet.findUnique({
      where: { id: goalSheetId },
      include: {
        user: true,
        goals: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!goalSheet) {
      return res.status(404).json({ error: "Goal sheet not found" });
    }

    if (goalSheet.user.managerId !== req.user?.id) {
      return res.status(403).json({ error: "Forbidden: Not your direct report" });
    }

    res.json({
      ...goalSheet,
      goals: goalSheet.goals.map((g) => ({
        ...g,
        thrustAreaLabel: thrustAreaToLabel(g.thrustArea),
      })),
    });
  } catch (error) {
    console.error("Error fetching goal sheet for review:", error);
    res.status(500).json({ error: "Failed to fetch goal sheet" });
  }
}

/**
 * Manager view of employee quarterly submission for evaluation
 */
export async function getTeamMemberQuarterReview(req: Request, res: Response) {
  try {
    const { employeeId } = req.params;
    const quarter = (req.query.quarter as string) || getSystemPhase(getSystemDate(req)).activeQuarter;

    if (!quarter) {
      return res.status(400).json({ error: "No active quarter for current system date" });
    }

    const employee = await prisma.user.findUnique({
      where: { id: employeeId },
    });

    if (!employee || employee.managerId !== req.user?.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const fiscalYear = deriveFiscalYear(getSystemDate(req));
    const goalSheet = await prisma.goalSheet.findFirst({
      where: { userId: employeeId, fiscalYear, isActive: true },
      include: {
        goals: { include: { quarterlyEntries: { where: { quarter: quarter as Quarter } } } },
        checkInComments: { where: { quarter: quarter as Quarter } },
        user: true,
      },
    });

    if (!goalSheet) {
      return res.status(404).json({ error: "Goal sheet not found" });
    }

    const checkIn = goalSheet.checkInComments[0] || null;
    const goals = goalSheet.goals.map((goal) => {
      const entry = goal.quarterlyEntries[0];
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
      };
    });

    res.json({
      employee: { id: employee.id, name: employee.name, email: employee.email },
      goalSheetId: goalSheet.id,
      quarter,
      checkIn,
      goals,
      canEvaluate: checkIn?.approvalStatus === "PENDING",
    });
  } catch (error) {
    console.error("Error fetching quarter review:", error);
    res.status(500).json({ error: "Failed to fetch quarter review" });
  }
}

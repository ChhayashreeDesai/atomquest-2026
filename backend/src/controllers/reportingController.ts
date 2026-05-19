import { Request, Response } from "express";
import { Quarter } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { deriveFiscalYear } from "../utils/cycleService.js";
import { getSystemDate } from "../middleware/authMiddleware.js";
import { thrustAreaToLabel } from "../utils/thrustAreaMapper.js";

async function buildManagerEffectivenessMetrics(managerId?: string) {
  const managers = await prisma.user.findMany({
    where: {
      role: "MANAGER",
      ...(managerId ? { id: managerId } : {}),
    },
    include: {
      reports: {
        include: {
          goalSheets: {
            where: { isActive: true },
            include: {
              checkInComments: true,
            },
          },
        },
      },
    },
  });

  return managers.map((manager) => {
    const pending = manager.reports.reduce((count, report) => {
      const sheet = report.goalSheets[0];
      if (!sheet) return count;
      return (
        count +
        sheet.checkInComments.filter((c) => c.approvalStatus === "PENDING").length
      );
    }, 0);

    const approved = manager.reports.reduce((count, report) => {
      const sheet = report.goalSheets[0];
      if (!sheet) return count;
      return (
        count +
        sheet.checkInComments.filter((c) => c.approvalStatus === "APPROVED").length
      );
    }, 0);

    const locked = manager.reports.filter(
      (r) => r.goalSheets[0]?.status === "LOCKED"
    ).length;

    const approvalRate =
      manager.reports.length > 0
        ? Math.round((locked / manager.reports.length) * 100)
        : 0;

    return {
      name: manager.name,
      value: approvalRate,
      teamSize: manager.reports.length,
      pendingCheckIns: pending,
      approvedCheckIns: approved,
      goalSheetsLocked: locked,
    };
  });
}

const QUARTERS: Quarter[] = ["Q1", "Q2", "Q3", "Q4"];

/**
 * Export achievement report as CSV
 */
export async function exportAchievementReport(req: Request, res: Response) {
  try {
    const fiscalYear =
      (req.query.fiscalYear as string) || deriveFiscalYear(getSystemDate(req));

    const scopeFilter =
      req.user?.role === "MANAGER"
        ? { user: { managerId: req.user.id } }
        : {};

    const goalSheets = await prisma.goalSheet.findMany({
      where: { fiscalYear, isActive: true, ...scopeFilter },
      include: {
        user: true,
        goals: { include: { quarterlyEntries: true } },
        checkInComments: true,
      },
    });

    let csv =
      "Employee Name,Email,Fiscal Year,Quarter,Goal Title,Thrust Area,Planned Target,Actual Achievement,Progress %,UoM,Weightage,Manager Sign-Off\n";

    goalSheets.forEach((sheet) => {
      const approvedQuarters = approvedQuarterSet(sheet.checkInComments);

      sheet.goals.forEach((goal) => {
        QUARTERS.forEach((quarter) => {
          const entry = goal.quarterlyEntries.find((e) => e.quarter === quarter);
          const approved = approvedQuarters.has(quarter);
          const signOff = approved ? "APPROVED" : entry?.isSubmitted ? "PENDING" : "NOT_SUBMITTED";

          csv += [
            sheet.user.name,
            sheet.user.email,
            fiscalYear,
            quarter,
            `"${goal.title.replace(/"/g, '""')}"`,
            goal.thrustArea,
            goal.targetValue,
            approved ? entry?.actualAchievement || "N/A" : "N/A",
            approved ? (entry?.progressScore ?? 0).toFixed(2) : "N/A",
            goal.uomType,
            goal.weightage,
            signOff,
          ].join(",") + "\n";
        });
      });
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="atomquest_achievement_${fiscalYear.replace("/", "-")}.csv"`
    );
    res.send(csv);
  } catch (error) {
    console.error("Error exporting report:", error);
    res.status(500).json({ error: "Failed to export report" });
  }
}

function approvedQuarterSet(
  comments: Array<{ quarter: Quarter; approvalStatus: string }>
): Set<Quarter> {
  return new Set(
    comments
      .filter((c) => c.approvalStatus === "APPROVED")
      .map((c) => c.quarter)
  );
}

function weightedQuarterScore(
  goals: Array<{
    weightage: number;
    quarterlyEntries: Array<{ quarter: Quarter; progressScore: number | null }>;
  }>,
  quarter: Quarter
): number | null {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const goal of goals) {
    const entry = goal.quarterlyEntries.find((e) => e.quarter === quarter);
    if (!entry) continue;
    weightedSum += (entry.progressScore || 0) * goal.weightage;
    totalWeight += goal.weightage;
  }
  if (totalWeight === 0) return null;
  return Math.round(weightedSum / totalWeight);
}

/**
 * HR compliance matrix — quarter filter with manager sign-off gate
 */
export async function getAdminComplianceMatrix(req: Request, res: Response) {
  try {
    const quarter = (req.query.quarter as Quarter) || "Q1";
    if (!QUARTERS.includes(quarter)) {
      return res.status(400).json({ error: "Invalid quarter" });
    }

    const fiscalYear =
      (req.query.fiscalYear as string) || deriveFiscalYear(getSystemDate(req));

    const employees = await prisma.user.findMany({
      where: { role: "EMPLOYEE" },
      include: {
        manager: true,
        goalSheets: {
          where: { fiscalYear, isActive: true },
          include: {
            goals: { include: { quarterlyEntries: true } },
            checkInComments: true,
          },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    });

    const rows = employees.map((emp) => {
      const sheet = emp.goalSheets[0];
      const approved = sheet
        ? sheet.checkInComments.some(
            (c) => c.quarter === quarter && c.approvalStatus === "APPROVED"
          )
        : false;

      let quarterPerformance: string | number = "Pending Evaluation";
      if (sheet && approved) {
        const score = weightedQuarterScore(sheet.goals, quarter);
        quarterPerformance = score !== null ? `${score}%` : "Pending Evaluation";
      } else if (sheet) {
        const hasSubmission = sheet.goals.some((g) =>
          g.quarterlyEntries.some((e) => e.quarter === quarter && e.isSubmitted)
        );
        if (!hasSubmission && sheet.status !== "LOCKED") {
          quarterPerformance = "Not Started";
        }
      } else {
        quarterPerformance = "No Sheet";
      }

      return {
        id: emp.id,
        goalSheetId: sheet?.id || null,
        employeeName: emp.name,
        employeeEmail: emp.email,
        managerName: emp.manager?.name || "Unassigned",
        annualStatus: sheet?.status || "NO_SHEET",
        quarterPerformance,
      };
    });

    const evaluated = rows.filter((r) => typeof r.quarterPerformance === "string" && r.quarterPerformance.endsWith("%"));
    const submittedAnnual = rows.filter((r) =>
      ["SUBMITTED", "LOCKED"].includes(r.annualStatus)
    ).length;
    const lockedAnnual = rows.filter((r) => r.annualStatus === "LOCKED").length;

    res.json({
      fiscalYear,
      quarter,
      summary: {
        totalEmployees: rows.length,
        goalsSubmitted: submittedAnnual,
        goalsApproved: lockedAnnual,
        completionRate:
          rows.length > 0
            ? Math.round((evaluated.length / rows.length) * 100)
            : 0,
        quarterEvaluated: evaluated.length,
      },
      rows,
    });
  } catch (error) {
    console.error("Error fetching admin compliance matrix:", error);
    res.status(500).json({ error: "Failed to fetch compliance matrix" });
  }
}

/**
 * Get completion dashboard metrics
 * APPROVAL GATE: Only shows APPROVED achievements to ADMIN
 */
export async function getCompletionDashboard(req: Request, res: Response) {
  try {
    const fiscalYear =
      (req.query.fiscalYear as string) || deriveFiscalYear(getSystemDate(req));
    const cycleYear = fiscalYear.split("-")[0];

    const goalSheets = await prisma.goalSheet.findMany({
      where: { fiscalYear, isActive: true },
      include: {
        user: { include: { manager: true } },
        goals: { include: { quarterlyEntries: true } },
        checkInComments: true,
      },
    });

    const users = await prisma.user.findMany();

    const totalEmployees = users.filter((u) => u.role === "EMPLOYEE").length;
    const submittedCount = goalSheets.filter((gs) =>
      ["SUBMITTED", "LOCKED"].includes(gs.status)
    ).length;
    const approvedCount = goalSheets.filter((gs) => gs.status === "LOCKED").length;
    const checkedInCount = goalSheets.filter((gs) =>
      gs.checkInComments.some((c) => c.approvalStatus === "APPROVED")
    ).length;

    const managerStats = users
      .filter((u) => u.role === "MANAGER")
      .map((manager) => {
        const theirSheets = goalSheets.filter(
          (gs) => gs.user.managerId === manager.id
        );
        return {
          managerName: manager.name,
          teamSize: theirSheets.length,
          approvedCount: theirSheets.filter((gs) => gs.status === "LOCKED").length,
          pendingCount: theirSheets.filter((gs) => gs.status === "SUBMITTED").length,
        };
      });

    const rows = goalSheets.map((gs) => {
      const quarterStatuses = QUARTERS.reduce(
        (acc, q) => {
          const approved = gs.checkInComments.some(
            (c) => c.quarter === q && c.approvalStatus === "APPROVED"
          );
          acc[`q${q.slice(1)}Status`] = approved ? "COMPLETED" : "PENDING";
          return acc;
        },
        {} as Record<string, string>
      );

      const approvedQuarters = approvedQuarterSet(gs.checkInComments);
      let overallCompletion = 0;
      let count = 0;
      gs.goals.forEach((g) => {
        g.quarterlyEntries
          .filter((e) => approvedQuarters.has(e.quarter))
          .forEach((e) => {
            overallCompletion += e.progressScore || 0;
            count++;
          });
      });

      return {
        id: gs.user.id,
        employeeName: gs.user.name,
        employeeEmail: gs.user.email,
        managerName: gs.user.manager?.name || "Unassigned",
        annualStatus: gs.status,
        overallCompletion:
          count > 0 ? Math.round(overallCompletion / count) : 0,
        ...quarterStatuses,
      };
    });

    const dashboard = {
      cycleYear,
      fiscalYear,
      summary: {
        totalEmployees,
        goalsSubmitted: submittedCount,
        goalsApproved: approvedCount,
        completionRate:
          totalEmployees > 0
            ? ((approvedCount / totalEmployees) * 100).toFixed(2)
            : "0",
        checkInCompleted: checkedInCount,
        checkInRate:
          totalEmployees > 0
            ? ((checkedInCount / totalEmployees) * 100).toFixed(2)
            : "0",
      },
      managerEffectiveness: managerStats,
      rows,
      detailedStatus: goalSheets.map((gs) => ({
        employeeName: gs.user.name,
        email: gs.user.email,
        status: gs.status,
        goalCount: gs.goals.length,
        checkInComments: gs.checkInComments.filter(
          (c) => c.approvalStatus === "APPROVED"
        ).length,
        averageProgress:
          gs.goals.length > 0
            ? (
                gs.goals.reduce((sum, g) => sum + (g.progressScore || 0), 0) /
                gs.goals.length
              ).toFixed(2)
            : 0,
      })),
    };

    res.json(dashboard);
  } catch (error) {
    console.error("Error fetching completion dashboard:", error);
    res.status(500).json({ error: "Failed to fetch dashboard" });
  }
}

/**
 * Employee progress analytics — only APPROVED quarter data is aggregated
 */
export async function getEmployeeProgress(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const fiscalYear =
      (req.query.fiscalYear as string) || deriveFiscalYear(getSystemDate(req));

    const goalSheet = await prisma.goalSheet.findUnique({
      where: { userId_fiscalYear: { userId, fiscalYear } },
      include: {
        goals: { include: { quarterlyEntries: true } },
        checkInComments: true,
      },
    });

    if (!goalSheet) {
      return res.json({
        fiscalYear,
        quarters: QUARTERS.map((q) => ({
          quarter: q,
          status: "NO_DATA",
          averageProgress: null,
          goals: [],
        })),
        summary: {
          approvedQuarters: 0,
          pendingQuarters: 0,
          annualProgress: null,
        },
      });
    }

    const quarterBlocks = QUARTERS.map((quarter) => {
      const comment = goalSheet.checkInComments.find((c) => c.quarter === quarter);
      const isApproved = comment?.approvalStatus === "APPROVED";
      const isPending =
        comment?.approvalStatus === "PENDING" ||
        goalSheet.goals.some((g) =>
          g.quarterlyEntries.some((e) => e.quarter === quarter && e.isSubmitted)
        );

      if (!isApproved) {
        return {
          quarter,
          status: isPending ? "PENDING_MANAGER_EVALUATION" : "NOT_SUBMITTED",
          averageProgress: null,
          goals: goalSheet.goals.map((g) => ({
            id: g.id,
            title: g.title,
            weightage: g.weightage,
            message: isPending
              ? "Pending Manager Evaluation"
              : "No submission for this quarter",
          })),
        };
      }

      const goals = goalSheet.goals.map((g) => {
        const entry = g.quarterlyEntries.find((e) => e.quarter === quarter);
        return {
          id: g.id,
          title: g.title,
          weightage: g.weightage,
          targetValue: g.targetValue,
          actualAchievement: entry?.actualAchievement,
          progressScore: entry?.progressScore ?? 0,
          completionStatus: entry?.completionStatus,
        };
      });

      const avg =
        goals.length > 0
          ? goals.reduce((s, g) => s + (g.progressScore || 0), 0) / goals.length
          : 0;

      return {
        quarter,
        status: "APPROVED",
        averageProgress: Number(avg.toFixed(2)),
        goals,
      };
    });

    const approved = quarterBlocks.filter((q) => q.status === "APPROVED");
    const pending = quarterBlocks.filter(
      (q) => q.status === "PENDING_MANAGER_EVALUATION"
    );

    const weightedAnnual =
      approved.length > 0
        ? approved.reduce((s, q) => s + (q.averageProgress || 0), 0) / approved.length
        : null;

    res.json({
      fiscalYear,
      goalSheetStatus: goalSheet.status,
      quarters: quarterBlocks,
      qoqTrends: quarterBlocks.map((q) => ({
        name: q.quarter,
        progress: q.averageProgress ?? 0,
        status: q.status,
      })),
      summary: {
        approvedQuarters: approved.length,
        pendingQuarters: pending.length,
        annualProgress: weightedAnnual !== null ? Number(weightedAnnual.toFixed(2)) : null,
      },
    });
  } catch (error) {
    console.error("Error fetching employee progress:", error);
    res.status(500).json({ error: "Failed to fetch employee progress" });
  }
}

/**
 * Get analytics data for charts (org-wide; managers/admins)
 */
export async function getAnalytics(req: Request, res: Response) {
  try {
    const systemDate = getSystemDate(req);
    const fiscalYear =
      (req.query.fiscalYear as string) || deriveFiscalYear(systemDate);
    const cycleYear = fiscalYear.split("-")[0];

    const scopeFilter =
      req.user?.role === "MANAGER"
        ? { user: { managerId: req.user.id } }
        : {};

    const goalSheets = await prisma.goalSheet.findMany({
      where: {
        fiscalYear,
        status: { not: "ARCHIVED" },
        ...scopeFilter,
      },
      include: {
        user: true,
        goals: { include: { quarterlyEntries: true } },
        checkInComments: true,
      },
    });

    // 1. Goal distribution by thrust area (approved quarterly data only)
    const thrustAreaDistribution: Record<string, any> = {};
    goalSheets.forEach((sheet) => {
      const approvedQuarters = approvedQuarterSet(sheet.checkInComments);
      sheet.goals.forEach((goal) => {
        const approvedEntries = goal.quarterlyEntries.filter((e) =>
          approvedQuarters.has(e.quarter)
        );
        const displayGoal =
          approvedEntries.length > 0
            ? {
                ...goal,
                progressScore:
                  approvedEntries.reduce((s, e) => s + (e.progressScore || 0), 0) /
                  approvedEntries.length,
                completionStatus: approvedEntries[approvedEntries.length - 1]
                  .completionStatus,
              }
            : goal;

        if (!thrustAreaDistribution[displayGoal.thrustArea]) {
          thrustAreaDistribution[displayGoal.thrustArea] = {
            name: displayGoal.thrustArea,
            count: 0,
            completed: 0,
            notStarted: 0,
            onTrack: 0,
          };
        }
        thrustAreaDistribution[displayGoal.thrustArea].count++;
        if (displayGoal.completionStatus === "COMPLETED")
          thrustAreaDistribution[displayGoal.thrustArea].completed++;
        if (displayGoal.completionStatus === "NOT_STARTED")
          thrustAreaDistribution[displayGoal.thrustArea].notStarted++;
        if (displayGoal.completionStatus === "ON_TRACK")
          thrustAreaDistribution[displayGoal.thrustArea].onTrack++;
      });
    });

    // 2. Goal distribution by UoM type
    const uomTypeDistribution: Record<string, number> = {};
    goalSheets.forEach((sheet) => {
      sheet.goals.forEach((goal) => {
        uomTypeDistribution[goal.uomType] =
          (uomTypeDistribution[goal.uomType] || 0) + 1;
      });
    });

    // 3. Completion status distribution
    const completionDistribution: Record<string, number> = {
      NOT_STARTED: 0,
      ON_TRACK: 0,
      COMPLETED: 0,
    };
    goalSheets.forEach((sheet) => {
      const approvedQuarters = approvedQuarterSet(sheet.checkInComments);
      sheet.goals.forEach((goal) => {
        const latestApproved = goal.quarterlyEntries
          .filter((e) => approvedQuarters.has(e.quarter))
          .sort((a, b) => QUARTERS.indexOf(b.quarter) - QUARTERS.indexOf(a.quarter))[0];
        const status = latestApproved?.completionStatus ?? goal.completionStatus;
        completionDistribution[status]++;
      });
    });

    // 4. Manager effectiveness (approval rate)
    const managerStats = await prisma.user.findMany({
      where: { role: "MANAGER" },
      include: {
        reports: {
          include: {
            goalSheets: true,
          },
        },
      },
    });

    const managerEffectiveness = managerStats.map((manager) => {
      const allReportSheets = manager.reports.flatMap((r) => r.goalSheets);
      const approvedSheets = allReportSheets.filter((gs) => gs.status === "LOCKED");
      return {
        managerName: manager.name,
        teamSize: manager.reports.length,
        approvalRate: manager.reports.length
          ? ((approvedSheets.length / manager.reports.length) * 100).toFixed(2)
          : 0,
      };
    });

    // 5. Average progress trend (if available)
    const progressTrend = goalSheets.map((sheet) => {
      const approvedQuarters = approvedQuarterSet(sheet.checkInComments);
      let total = 0;
      let count = 0;
      sheet.goals.forEach((g) => {
        g.quarterlyEntries
          .filter((e) => approvedQuarters.has(e.quarter))
          .forEach((e) => {
            total += e.progressScore || 0;
            count++;
          });
      });
      return {
        employee: sheet.user.name,
        avgProgress: count > 0 ? (total / count).toFixed(2) : "0",
        goalCount: sheet.goals.length,
      };
    });

    const totalGoals = goalSheets.reduce((s, sheet) => s + sheet.goals.length, 0);
    const completedGoals = completionDistribution.COMPLETED;
    const onTrackGoals = completionDistribution.ON_TRACK;
    const notStartedGoals = completionDistribution.NOT_STARTED;

    const qoqTrends = QUARTERS.map((q) => {
      const pendingCount = goalSheets.filter((sheet) => {
        const comment = sheet.checkInComments.find((c) => c.quarter === q);
        const hasSubmitted = sheet.goals.some((g) =>
          g.quarterlyEntries.some((e) => e.quarter === q && e.isSubmitted)
        );
        return hasSubmitted && (!comment || comment.approvalStatus === "PENDING");
      }).length;

      let approvedProgress = 0;
      let approvedCount = 0;
      goalSheets.forEach((sheet) => {
        const approved = sheet.checkInComments.some(
          (c) => c.quarter === q && c.approvalStatus === "APPROVED"
        );
        if (!approved) return;
        sheet.goals.forEach((g) => {
          const entry = g.quarterlyEntries.find((e) => e.quarter === q);
          if (entry) {
            approvedProgress += entry.progressScore || 0;
            approvedCount++;
          }
        });
      });

      const avgProgress =
        approvedCount > 0 ? Math.round(approvedProgress / approvedCount) : 0;

      return {
        name: q,
        completed: avgProgress,
        onTrack: pendingCount > 0 ? 0 : Math.max(0, 100 - avgProgress),
        notStarted: pendingCount,
        pendingEvaluation: pendingCount,
        avgProgress,
        status: pendingCount > 0 ? "PENDING_MANAGER_EVALUATION" : approvedCount > 0 ? "APPROVED" : "NOT_SUBMITTED",
      };
    });

    const thrustAreaBreakdown = Object.values(thrustAreaDistribution).map(
      (area: { name: string; count: number }) => ({
        name: thrustAreaToLabel(area.name),
        value: area.count,
      })
    );

    const goalDistribution = [
      { name: "Completed", value: completedGoals },
      { name: "On Track", value: onTrackGoals },
      { name: "Not Started", value: notStartedGoals },
    ];

    const managerEffectivenessChart = await buildManagerEffectivenessMetrics(
      req.user?.role === "MANAGER" ? req.user.id : undefined
    );

    let avgCompletion = 0;
    let progressCount = 0;
    progressTrend.forEach((p) => {
      avgCompletion += parseFloat(String(p.avgProgress));
      progressCount++;
    });

    const analytics = {
      cycleYear,
      fiscalYear,
      thrustAreaDistribution: Object.values(thrustAreaDistribution),
      thrustAreaBreakdown,
      uomTypeDistribution: Object.entries(uomTypeDistribution).map(([type, count]) => ({
        type,
        count,
      })),
      completionDistribution,
      goalDistribution,
      managerEffectiveness: managerEffectivenessChart,
      managerEffectivenessRaw: managerEffectiveness,
      progressTrend,
      qoqTrends,
      summary: {
        totalGoals,
        completedGoals,
        onTrackGoals,
        atRiskGoals: notStartedGoals,
        averageCompletion: progressCount > 0 ? avgCompletion / progressCount : 0,
        pendingEvaluations: qoqTrends.reduce((s, q) => s + (q.pendingEvaluation || 0), 0),
      },
    };

    res.json(analytics);
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
}

/**
 * Get audit trail for a specific goal
 */
export async function getAuditTrail(req: Request, res: Response) {
  try {
    const { goalId } = req.params;

    const auditLogs = await prisma.auditLog.findMany({
      where: { goalId },
      include: {
        changedBy: true,
      },
      orderBy: { timestamp: "desc" },
    });

    res.json(auditLogs);
  } catch (error) {
    console.error("Error fetching audit trail:", error);
    res.status(500).json({ error: "Failed to fetch audit trail" });
  }
}

/**
 * Get all audit trails for a goal sheet
 */
export async function getGoalSheetAuditTrail(req: Request, res: Response) {
  try {
    const { goalSheetId } = req.params;

    const goalSheet = await prisma.goalSheet.findUnique({
      where: { id: goalSheetId },
      include: {
        goals: {
          include: {
            auditLogs: {
              include: {
                changedBy: true,
              },
              orderBy: { timestamp: "desc" },
            },
          },
        },
      },
    });

    if (!goalSheet) {
      return res.status(404).json({ error: "Goal sheet not found" });
    }

    const auditTrail = goalSheet.goals.flatMap((goal) =>
      goal.auditLogs.map((log) => ({
        goalTitle: goal.title,
        ...log,
      }))
    );

    res.json(auditTrail);
  } catch (error) {
    console.error("Error fetching audit trail:", error);
    res.status(500).json({ error: "Failed to fetch audit trail" });
  }
}

/**
 * Admin: Clear all current (non-archived) goals for all employees
 * Deletes all goals from active goal sheets in current fiscal year
 */
export async function clearAllCurrentGoals(req: Request, res: Response) {
  try {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Only admins can clear goals" });
    }

    const systemDate = getSystemDate(req);
    const fiscalYear = deriveFiscalYear(systemDate);

    // Find all active goal sheets for current fiscal year
    const activeGoalSheets = await prisma.goalSheet.findMany({
      where: {
        fiscalYear,
        isActive: true,
        status: { not: "ARCHIVED" },
      },
      include: { goals: true },
    });

    const totalGoalsBefore = activeGoalSheets.reduce(
      (sum, sheet) => sum + sheet.goals.length,
      0
    );

    // Delete all goals from these sheets
    await prisma.goal.deleteMany({
      where: {
        goalSheet: {
          fiscalYear,
          isActive: true,
          status: { not: "ARCHIVED" },
        },
      },
    });

    // Reset goal sheets to DRAFT status
    await prisma.goalSheet.updateMany({
      where: {
        fiscalYear,
        isActive: true,
        status: { not: "ARCHIVED" },
      },
      data: {
        status: "DRAFT",
        managerFeedback: null,
      },
    });

    res.json({
      message: "All current goals cleared successfully",
      fiscalYear,
      totalGoalsDeleted: totalGoalsBefore,
      goalSheetsReset: activeGoalSheets.length,
    });
  } catch (error) {
    console.error("Error clearing goals:", error);
    res.status(500).json({ error: "Failed to clear goals" });
  }
}

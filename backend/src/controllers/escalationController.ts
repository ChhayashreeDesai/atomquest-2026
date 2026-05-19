import { Request, Response } from "express";
import { EscalationLevel, NotificationType, Quarter } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { getSystemDate } from "../middleware/authMiddleware";
import {
  deriveCycleYear,
  deriveFiscalYear,
  getSystemPhase,
  isGoalCreationWindow,
  isWithinActiveWindow,
} from "../utils/cycleService";
import { getActiveQuarterByDate } from "../utils/calculationEngine";

type StageRule = {
  level: EscalationLevel;
  days: number;
};

type EscalationRuleConfig = {
  goalSubmission: StageRule[];
  managerApproval: StageRule[];
  quarterlyCheckIn: StageRule[];
};

const DEFAULT_RULES: EscalationRuleConfig = {
  goalSubmission: [
    { level: "EMPLOYEE", days: 7 },
    { level: "MANAGER", days: 10 },
    { level: "HR", days: 14 },
  ],
  managerApproval: [
    { level: "MANAGER", days: 3 },
    { level: "HR", days: 7 },
  ],
  quarterlyCheckIn: [
    { level: "EMPLOYEE", days: 5 },
    { level: "MANAGER", days: 10 },
    { level: "HR", days: 15 },
  ],
};

function daysBetween(later: Date, earlier: Date): number {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / 86400000));
}

function fiscalYearStart(fiscalYear: string): Date {
  const [startYear] = fiscalYear.split("-").map(Number);
  return new Date(startYear, 4, 1);
}

function quarterOpenDate(fiscalYear: string, quarter: Quarter): Date {
  const [startYear] = fiscalYear.split("-").map(Number);
  switch (quarter) {
    case "Q1":
      return new Date(startYear, 6, 15);
    case "Q2":
      return new Date(startYear, 9, 15);
    case "Q3":
      return new Date(startYear + 1, 0, 15);
    case "Q4":
      return new Date(startYear + 1, 3, 15);
    default:
      return new Date(startYear, 4, 1);
  }
}

function mergeRules(input: unknown): EscalationRuleConfig {
  if (!input || typeof input !== "object") {
    return DEFAULT_RULES;
  }

  const typed = input as Partial<EscalationRuleConfig>;
  return {
    goalSubmission: typed.goalSubmission?.length ? typed.goalSubmission : DEFAULT_RULES.goalSubmission,
    managerApproval: typed.managerApproval?.length ? typed.managerApproval : DEFAULT_RULES.managerApproval,
    quarterlyCheckIn: typed.quarterlyCheckIn?.length ? typed.quarterlyCheckIn : DEFAULT_RULES.quarterlyCheckIn,
  };
}

async function createEscalationLog(
  tx: typeof prisma,
  params: {
    recipientId: string;
    recipientLevel: EscalationLevel;
    ruleTriggered: string;
    subject: string;
    body: string;
  }
) {
  const existing = await tx.escalation.findFirst({
    where: {
      userId: params.recipientId,
      level: params.recipientLevel,
      ruleTriggered: params.ruleTriggered,
      status: "OPEN",
    },
  });

  if (existing) {
    return null;
  }

  const escalation = await tx.escalation.create({
    data: {
      userId: params.recipientId,
      ruleTriggered: params.ruleTriggered,
      level: params.recipientLevel,
      status: "OPEN",
    },
    include: { user: { include: { manager: true } } },
  });

  await tx.notification.create({
    data: {
      userId: params.recipientId,
      type: NotificationType.ESCALATION_ALERT,
      subject: params.subject,
      body: params.body,
    },
  });

  return escalation;
}

/**
 * Check for escalation rules and create escalations if needed
 */
export async function evaluateEscalationRules(req: Request, res: Response) {
  try {
    const systemDate = getSystemDate(req);
    const fiscalYear =
      (req.body?.fiscalYear as string) ||
      (req.query.fiscalYear as string) ||
      deriveFiscalYear(systemDate);
    const cycleYear = deriveCycleYear(systemDate);
    const activeQuarter = getActiveQuarterByDate(systemDate);
    const rules = mergeRules(req.body?.rules);
    const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });

    const employees = await prisma.user.findMany({
      where: { role: "EMPLOYEE" },
      include: {
        manager: true,
        goalSheets: {
          where: { fiscalYear, isActive: true },
          include: {
            checkInComments: { orderBy: { timestamp: "desc" } },
          },
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
      },
    });

    const createdEscalations = await prisma.$transaction(async (tx) => {
      const created: Awaited<ReturnType<typeof createEscalationLog>>[] = [];

      for (const employee of employees) {
        const goalSheet = employee.goalSheets[0] || null;

        if (isGoalCreationWindow(systemDate)) {
          const overdueDays = daysBetween(systemDate, fiscalYearStart(fiscalYear));
          const ruleKey = `GOAL_SUBMISSION_DELAY:${fiscalYear}`;
          if (!goalSheet || goalSheet.status === "DRAFT") {
            for (const stage of rules.goalSubmission) {
              if (overdueDays < stage.days) continue;

              const recipients =
                stage.level === "EMPLOYEE"
                  ? [employee.id]
                  : stage.level === "MANAGER"
                    ? employee.manager?.id
                      ? [employee.manager.id]
                      : []
                    : admins.map((admin) => admin.id);

              for (const recipientId of recipients) {
                const entry = await createEscalationLog(tx, {
                  recipientId,
                  recipientLevel: stage.level,
                  ruleTriggered: `${ruleKey}:${stage.level}`,
                  subject: `Goal submission overdue for ${employee.name}`,
                  body:
                    `${employee.name} has not submitted goals within ${stage.days} days of cycle open. ` +
                    `Current fiscal year: ${fiscalYear}.`,
                });
                if (entry) created.push(entry);
              }
            }
          }
        }

        if (goalSheet?.status === "SUBMITTED") {
          const overdueDays = daysBetween(systemDate, goalSheet.updatedAt);
          const ruleKey = `MANAGER_APPROVAL_DELAY:${fiscalYear}`;

          for (const stage of rules.managerApproval) {
            if (overdueDays < stage.days) continue;

            const recipients =
              stage.level === "MANAGER"
                ? employee.manager?.id
                  ? [employee.manager.id]
                  : []
                : admins.map((admin) => admin.id);

            for (const recipientId of recipients) {
              const entry = await createEscalationLog(tx, {
                recipientId,
                recipientLevel: stage.level,
                ruleTriggered: `${ruleKey}:${stage.level}`,
                subject: `Goal approval overdue for ${employee.name}`,
                body:
                  `${employee.name} submitted goals ${overdueDays} days ago and the sheet is still pending approval. ` +
                  `Fiscal year: ${fiscalYear}.`,
              });
              if (entry) created.push(entry);
            }
          }
        }

        if (
          goalSheet?.status === "LOCKED" &&
          activeQuarter &&
          isWithinActiveWindow(systemDate, `${activeQuarter}_CHECK_IN`)
        ) {
          const quarterComment =
            goalSheet.checkInComments.find((comment) => comment.quarter === activeQuarter) || null;
          const overdueDays = daysBetween(
            systemDate,
            quarterComment?.timestamp || quarterOpenDate(fiscalYear, activeQuarter)
          );
          const isComplete = quarterComment?.approvalStatus === "APPROVED";
          const ruleKey = `QUARTERLY_CHECKIN_DELAY:${activeQuarter}:${fiscalYear}`;

          if (!isComplete) {
            for (const stage of rules.quarterlyCheckIn) {
              if (overdueDays < stage.days) continue;

              const recipients =
                stage.level === "EMPLOYEE"
                  ? [employee.id]
                  : stage.level === "MANAGER"
                    ? employee.manager?.id
                      ? [employee.manager.id]
                      : []
                    : admins.map((admin) => admin.id);

              for (const recipientId of recipients) {
                const entry = await createEscalationLog(tx, {
                  recipientId,
                  recipientLevel: stage.level,
                  ruleTriggered: `${ruleKey}:${stage.level}`,
                  subject: `Quarter ${activeQuarter} check-in overdue for ${employee.name}`,
                  body:
                    `${employee.name} has not completed ${activeQuarter} check-in within ${stage.days} days of the active window. ` +
                    `Cycle year: ${cycleYear}.`,
                });
                if (entry) created.push(entry);
              }
            }
          }
        }
      }

      return created;
    });

    res.json({
      message: "Escalation rules evaluated",
      fiscalYear,
      cycleYear,
      activeQuarter,
      escalationsCreated: createdEscalations.length,
      escalations: createdEscalations,
    });
  } catch (error) {
    console.error("Error evaluating escalation rules:", error);
    res.status(500).json({ error: "Failed to evaluate escalation rules" });
  }
}

/**
 * Get escalations for current user or all (admin)
 */
export async function getEscalations(req: Request, res: Response) {
  try {
    const isAdmin = req.user?.role === "ADMIN";
    const userId = isAdmin ? undefined : req.user?.id;

    const escalations = await prisma.escalation.findMany({
      where: userId ? { userId } : {},
      include: {
        user: {
          include: {
            manager: true,
          },
        },
      },
      orderBy: { timestamp: "desc" },
    });

    res.json(escalations);
  } catch (error) {
    console.error("Error fetching escalations:", error);
    res.status(500).json({ error: "Failed to fetch escalations" });
  }
}

/**
 * Resolve an escalation
 */
export async function resolveEscalation(req: Request, res: Response) {
  try {
    const { escalationId } = req.params;

    const escalation = await prisma.escalation.findUnique({
      where: { id: escalationId },
      include: { user: true },
    });

    if (!escalation) {
      return res.status(404).json({ error: "Escalation not found" });
    }

    if (req.user?.role !== "ADMIN" && req.user?.id !== escalation.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const resolved = await prisma.escalation.update({
      where: { id: escalationId },
      data: { status: "RESOLVED" },
      include: { user: true },
    });

    res.json(resolved);
  } catch (error) {
    console.error("Error resolving escalation:", error);
    res.status(500).json({ error: "Failed to resolve escalation" });
  }
}

/**
 * Get HR escalation panel (admin only)
 */
export async function getHREscalationPanel(req: Request, res: Response) {
  try {
    const allEscalations = await prisma.escalation.findMany({
      include: {
        user: {
          include: {
            manager: true,
          },
        },
      },
      orderBy: { timestamp: "desc" },
    });

    const panel = {
      totalOpen: allEscalations.filter((e) => e.status === "OPEN").length,
      totalResolved: allEscalations.filter((e) => e.status === "RESOLVED").length,
      byRule: {} as Record<string, any>,
      byLevel: {} as Record<string, any>,
      recent: allEscalations.slice(0, 25).map((esc) => ({
        escalationId: esc.id,
        userName: esc.user.name,
        userEmail: esc.user.email,
        managerName: esc.user.manager?.name || null,
        ruleTriggered: esc.ruleTriggered,
        level: esc.level,
        status: esc.status,
        timestamp: esc.timestamp,
      })),
    };

    allEscalations.forEach((esc) => {
      if (!panel.byRule[esc.ruleTriggered]) {
        panel.byRule[esc.ruleTriggered] = {
          rule: esc.ruleTriggered,
          openCount: 0,
          resolvedCount: 0,
          items: [],
        };
      }

      if (esc.status === "OPEN") {
        panel.byRule[esc.ruleTriggered].openCount++;
      } else {
        panel.byRule[esc.ruleTriggered].resolvedCount++;
      }

      panel.byRule[esc.ruleTriggered].items.push({
        escalationId: esc.id,
        userName: esc.user.name,
        userEmail: esc.user.email,
        managerName: esc.user.manager?.name || null,
        timestamp: esc.timestamp,
        status: esc.status,
        level: esc.level,
      });

      if (!panel.byLevel[esc.level]) {
        panel.byLevel[esc.level] = {
          level: esc.level,
          count: 0,
          items: [],
        };
      }

      panel.byLevel[esc.level].count++;
      panel.byLevel[esc.level].items.push({
        escalationId: esc.id,
        userName: esc.user.name,
        ruleTriggered: esc.ruleTriggered,
        status: esc.status,
        timestamp: esc.timestamp,
      });
    });

    res.json(panel);
  } catch (error) {
    console.error("Error fetching HR escalation panel:", error);
    res.status(500).json({ error: "Failed to fetch escalation panel" });
  }
}

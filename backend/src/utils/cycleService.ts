import { prisma } from "../lib/prisma";
import {
  getActiveQuarterByDate,
  isGoalCreationWindow,
  isWithinActiveWindow,
} from "./calculationEngine";

/**
 * Fiscal year runs May 1 – April 30 (e.g. May 2026 → "2026-2027").
 */
export function deriveFiscalYear(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  if (month >= 4) {
    return `${year}-${year + 1}`;
  }
  return `${year - 1}-${year}`;
}

export function deriveCycleYear(date: Date): string {
  const fy = deriveFiscalYear(date);
  return fy.split("-")[0];
}

export type SystemPhase = "GOAL_CREATION" | "QUARTERLY_TRACKING";

export function getSystemPhase(date: Date): {
  phase: SystemPhase;
  activeQuarter: "Q1" | "Q2" | "Q3" | "Q4" | null;
  fiscalYear: string;
  cycleYear: string;
} {
  const fiscalYear = deriveFiscalYear(date);
  const cycleYear = deriveCycleYear(date);
  const activeQuarter = getActiveQuarterByDate(date);

  return {
    phase: isGoalCreationWindow(date) ? "GOAL_CREATION" : "QUARTERLY_TRACKING",
    activeQuarter,
    fiscalYear,
    cycleYear,
  };
}

/**
 * Archives prior active sheets when a new fiscal year begins and ensures
 * an active sheet exists for the current fiscal year.
 */
export async function ensureActiveGoalSheet(userId: string, systemDate: Date) {
  const fiscalYear = deriveFiscalYear(systemDate);
  const cycleYear = deriveCycleYear(systemDate);
  const inCreationWindow = isGoalCreationWindow(systemDate);

  const priorActiveSheets = await prisma.goalSheet.findMany({
    where: {
      userId,
      isActive: true,
      fiscalYear: { not: fiscalYear },
    },
  });

  if (priorActiveSheets.length > 0) {
    await prisma.goalSheet.updateMany({
      where: {
        userId,
        isActive: true,
        fiscalYear: { not: fiscalYear },
      },
      data: {
        isActive: false,
        status: "ARCHIVED",
      },
    });
  }

  let goalSheet = await prisma.goalSheet.findUnique({
    where: {
      userId_fiscalYear: { userId, fiscalYear },
    },
    include: {
      goals: { include: { quarterlyEntries: true } },
      checkInComments: true,
      user: true,
    },
  });

  if (!goalSheet && inCreationWindow) {
    goalSheet = await prisma.goalSheet.create({
      data: {
        userId,
        fiscalYear,
        cycleYear,
        quarter: "ANNUAL",
        status: "DRAFT",
        isActive: true,
      },
      include: {
        goals: { include: { quarterlyEntries: true } },
        checkInComments: true,
        user: true,
      },
    });
  }

  if (goalSheet && goalSheet.isActive) {
    const others = await prisma.goalSheet.findMany({
      where: {
        userId,
        isActive: true,
        id: { not: goalSheet.id },
      },
    });
    if (others.length > 0) {
      await prisma.goalSheet.updateMany({
        where: {
          userId,
          isActive: true,
          id: { not: goalSheet.id },
        },
        data: { isActive: false },
      });
    }
  }

  return goalSheet;
}

export async function listGoalSheetHistory(userId: string) {
  return prisma.goalSheet.findMany({
    where: { userId },
    orderBy: { fiscalYear: "desc" },
    select: {
      id: true,
      fiscalYear: true,
      cycleYear: true,
      status: true,
      isActive: true,
      quarter: true,
      createdAt: true,
    },
  });
}

export { isGoalCreationWindow, isWithinActiveWindow };

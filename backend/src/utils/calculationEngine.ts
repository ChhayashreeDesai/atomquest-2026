import { UoMType } from "@prisma/client";

/**
 * Progress Score Calculator
 * Calculates progress based on UoM type and achievement vs target
 */

export function calculateProgressScore(
  uomType: UoMType,
  target: number | string,
  achievement: number | string | null | undefined
): number {
  if (!achievement) return 0;

  const targetNum = parseFloat(String(target));
  const achievementNum = parseFloat(String(achievement));

  if (isNaN(targetNum) || isNaN(achievementNum)) return 0;

  switch (uomType) {
    case "MIN_NUMERIC":
      // Higher is better (e.g., Sales Revenue)
      // Progress = (Achievement / Target) * 100
      return Math.min((achievementNum / targetNum) * 100, 100);

    case "MAX_NUMERIC":
      // Lower is better (e.g., TAT, Cost)
      // Progress = (Target / Achievement) * 100
      return Math.min((targetNum / achievementNum) * 100, 100);

    case "TIMELINE": {
      // Date-based completion
      // If Actual Date <= Target Date, Progress = 100%, else 0%
      const targetDate = new Date(String(target));
      const achievedDate = new Date(String(achievement));

      if (achievedDate <= targetDate) {
        return 100;
      }
      return 0;
    }

    case "ZERO":
      // Zero = Success (e.g., Safety incidents)
      // If Achievement == 0 -> 100%, else 0%
      return achievementNum === 0 ? 100 : 0;

    default:
      return 0;
  }
}

/**
 * Validate goal weightage
 * Total weightage must be exactly 100%
 * Each goal must be >= 10%
 */
export function validateWeightage(weightages: number[]): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (weightages.length === 0) {
    errors.push("At least one goal is required");
    return { isValid: false, errors };
  }

  if (weightages.length > 8) {
    errors.push("Maximum 8 goals allowed per employee");
  }

  const total = weightages.reduce((sum, w) => sum + w, 0);
  if (total !== 100) {
    errors.push(
      `Total weightage must be exactly 100%. Current: ${total}%`
    );
  }

  weightages.forEach((w, idx) => {
    if (w < 10) {
      errors.push(
        `Goal ${idx + 1}: Weightage must be at least 10%. Current: ${w}%`
      );
    }
  });

  return { isValid: errors.length === 0, errors };
}

/**
 * Get current active quarter based on system date
 * Fiscal year: May - April (e.g., 2026-2027)
 * Q1: July 15 - Oct 14 (then shows as Q1)
 * Q2: Oct 15 - Jan 14 (then shows as Q2)
 * Q3: Jan 15 - Apr 14 (then shows as Q3) 
 * Q4: Apr 15 - Apr 30 (then shows as Q4)
 * Goal creation: May 1 - May 31 (no active quarter)
 */
export function getActiveQuarterByDate(
  date: Date
): "Q1" | "Q2" | "Q3" | "Q4" | null {
  const month = date.getMonth();
  const day = date.getDate();

  // Exact date boundaries for quarter openings
  if (month === 4 && day === 1) return null;  // May 1 - goal creation starts
  if (month === 3 && day === 15) return "Q4"; // Apr 15 - Q4 opens
  if (month === 0 && day === 15) return "Q3"; // Jan 15 - Q3 opens
  if (month === 9 && day === 15) return "Q2"; // Oct 15 - Q2 opens
  if (month === 6 && day === 15) return "Q1"; // Jul 15 - Q1 opens

  // Range logic for quarters
  // Jan (0), Feb (1), Mar (2) = Q3 or Q4 depending on date
  // Apr (3) = Q1 or Q4 depending on date
  // May (4) = goal creation (null) or Q1 depending on date
  // Jun (5) = Q1
  // Jul (6), Aug (7), Sep (8) = Q1 or Q2 depending on date
  // Oct (9), Nov (10), Dec (11) = Q2 or Q3 depending on date

  if (month === 0 && day < 15) return "Q4";  // Jan 1-14 = Q4
  if (month === 0 && day >= 15) return "Q3"; // Jan 15+ = Q3
  if (month === 1) return "Q3";              // Feb = Q3
  if (month === 2) return "Q3";              // Mar = Q3
  if (month === 3 && day < 15) return "Q3";  // Apr 1-14 = Q3
  if (month === 3 && day >= 15) return "Q4"; // Apr 15+ = Q4
  if (month === 4) return null;              // May = goal creation
  if (month === 5) return "Q1";              // Jun = Q1
  if (month === 6 && day < 15) return "Q1";  // Jul 1-14 = Q1
  if (month === 6 && day >= 15) return "Q1"; // Jul 15+ = Q1
  if (month === 7) return "Q1";              // Aug = Q1 (well before Q2)
  if (month === 8 && day < 15) return "Q2";  // Sep 1-14 = Q2
  if (month === 8 && day >= 15) return "Q2"; // Sep 15+ = Q2
  if (month === 9 && day < 15) return "Q2";  // Oct 1-14 = Q2
  if (month === 9 && day >= 15) return "Q2"; // Oct 15+ = Q2
  if (month === 10) return "Q3";             // Nov = Q3
  if (month === 11) return "Q3";             // Dec = Q3

  return null;  // Shouldn't reach here
}

export function isGoalCreationWindow(date: Date): boolean {
  return date.getMonth() === 4;
}

/**
 * Check if current date is within active window
 */
export function isWithinActiveWindow(date: Date, windowType: string): boolean {
  const month = date.getMonth();
  const day = date.getDate();

  switch (windowType) {
    case "GOAL_CREATION":
      return month === 4; // May
    case "Q1_CHECK_IN":
      return month === 6; // July
    case "Q2_CHECK_IN":
      return month === 9; // October
    case "Q3_CHECK_IN":
      return month === 0; // January
    case "Q4_CHECK_IN":
      return month === 3 || month === 2; // March/April
    default:
      return false;
  }
}

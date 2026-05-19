export type UoMType = "MIN_NUMERIC" | "MAX_NUMERIC" | "TIMELINE" | "ZERO";

export function calculateProgressScore(
  uomType: UoMType,
  target: string | number,
  achievement: string | number | null | undefined
): number {
  if (achievement === null || achievement === undefined || achievement === "") {
    return 0;
  }

  switch (uomType) {
    case "TIMELINE": {
      const targetDate = new Date(String(target));
      const achievedDate = new Date(String(achievement));
      if (isNaN(targetDate.getTime()) || isNaN(achievedDate.getTime())) return 0;
      return achievedDate <= targetDate ? 100 : 0;
    }
    case "ZERO": {
      const achievementNum = parseFloat(String(achievement));
      if (isNaN(achievementNum)) return 0;
      return achievementNum === 0 ? 100 : 0;
    }
    default: {
      const targetNum = parseFloat(String(target));
      const achievementNum = parseFloat(String(achievement));
      if (isNaN(targetNum) || isNaN(achievementNum) || targetNum === 0) return 0;

      if (uomType === "MIN_NUMERIC") {
        return Math.min(Math.round((achievementNum / targetNum) * 100), 100);
      }
      if (uomType === "MAX_NUMERIC") {
        if (achievementNum === 0) return 0;
        return Math.min(Math.round((targetNum / achievementNum) * 100), 100);
      }
      return 0;
    }
  }
}

import { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { getSystemDate } from "../middleware/authMiddleware.js";
import { deriveCycleYear } from "../utils/cycleService.js";

/**
 * Create and share a goal with multiple employees
 */
export async function createAndShareGoal(req: Request, res: Response) {
  try {
    const { goalSheetId } = req.params;
    const { thrustArea, title, description, uomType, targetValue, recipientUserIds } =
      req.body;

    if (!Array.isArray(recipientUserIds) || recipientUserIds.length === 0) {
      return res.status(400).json({ error: "Recipient user IDs are required" });
    }

    // Create parent goal
    const parentGoal = await prisma.goal.create({
      data: {
        goalSheetId,
        thrustArea,
        title,
        description,
        uomType,
        targetValue: String(targetValue),
        isShared: true,
        weightage: 0, // Will be set by recipients
        primaryOwnerId: req.user?.id,
        completionStatus: "NOT_STARTED",
      },
    });

    // Create goal copies for each recipient
    const sharedGoals = [];
    for (const userId of recipientUserIds) {
      // Get or create goal sheet for recipient
      let recipientGoalSheet = await prisma.goalSheet.findFirst({
        where: { userId },
      });

      if (!recipientGoalSheet) {
        const cycleYear = deriveCycleYear(getSystemDate(req));
        recipientGoalSheet = await prisma.goalSheet.create({
          data: {
            userId,
            cycleYear,
            status: "DRAFT",
          },
        });
      }

      // Create shared goal (read-only fields)
      const sharedGoal = await prisma.goal.create({
        data: {
          goalSheetId: recipientGoalSheet.id,
          thrustArea,
          title, // Read-only
          description,
          uomType,
          targetValue: String(targetValue), // Read-only
          isShared: true,
          weightage: 0, // To be set by recipient
          sharedGoalParentId: parentGoal.id,
          primaryOwnerId: req.user?.id,
          completionStatus: "NOT_STARTED",
        },
      });

      sharedGoals.push(sharedGoal);
    }

    res.status(201).json({
      parentGoal,
      sharedGoals,
      message: `Shared goal created and distributed to ${recipientUserIds.length} employees`,
    });
  } catch (error) {
    console.error("Error creating shared goal:", error);
    res.status(500).json({ error: "Failed to create shared goal" });
  }
}

/**
 * Get all shared goals (for admin/manager)
 */
export async function getSharedGoals(req: Request, res: Response) {
  try {
    const sharedGoals = await prisma.goal.findMany({
      where: { isShared: true },
      include: {
        goalSheet: {
          include: {
            user: true,
          },
        },
        primaryOwner: true,
        sharedGoalChildren: true,
      },
    });

    const groupedByParent = new Map();

    sharedGoals.forEach((goal) => {
      if (!goal.sharedGoalParentId) {
        // Parent goal
        groupedByParent.set(goal.id, {
          parentGoal: goal,
          children: [],
        });
      }
    });

    sharedGoals.forEach((goal) => {
      if (goal.sharedGoalParentId && groupedByParent.has(goal.sharedGoalParentId)) {
        groupedByParent.get(goal.sharedGoalParentId).children.push(goal);
      }
    });

    res.json(Array.from(groupedByParent.values()));
  } catch (error) {
    console.error("Error fetching shared goals:", error);
    res.status(500).json({ error: "Failed to fetch shared goals" });
  }
}

/**
 * Update shared goal achievement (auto-syncs to all recipients)
 */
export async function updateSharedGoalAchievement(req: Request, res: Response) {
  try {
    const { goalId } = req.params;
    const { actualAchievement } = req.body;

    const goal = await prisma.goal.findUnique({
      where: { id: goalId },
      include: {
        sharedGoalChildren: true,
      },
    });

    if (!goal) {
      return res.status(404).json({ error: "Goal not found" });
    }

    if (!goal.isShared || !goal.primaryOwnerId) {
      return res
        .status(400)
        .json({ error: "This goal is not a shared goal or you don't have permission" });
    }

    if (req.user?.id !== goal.primaryOwnerId && req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Only the goal owner can update" });
    }

    // Update parent goal
    const updated = await prisma.goal.update({
      where: { id: goalId },
      data: {
        actualAchievement: String(actualAchievement),
      },
    });

    // Sync to all child goals
    for (const childGoal of goal.sharedGoalChildren) {
      await prisma.goal.update({
        where: { id: childGoal.id },
        data: {
          actualAchievement: String(actualAchievement),
        },
      });
    }

    res.json({
      message: "Shared goal achievement updated and synced to all recipients",
      updated,
      syncedCount: goal.sharedGoalChildren.length,
    });
  } catch (error) {
    console.error("Error updating shared goal:", error);
    res.status(500).json({ error: "Failed to update shared goal" });
  }
}

/**
 * Recipient updates weightage on shared goal
 */
export async function updateSharedGoalWeightage(req: Request, res: Response) {
  try {
    const { goalId } = req.params;
    const { weightage } = req.body;

    const goal = await prisma.goal.findUnique({
      where: { id: goalId },
      include: {
        goalSheet: true,
      },
    });

    if (!goal) {
      return res.status(404).json({ error: "Goal not found" });
    }

    if (!goal.isShared || !goal.sharedGoalParentId) {
      return res.status(400).json({
        error: "This is not a shared goal recipient copy",
      });
    }

    // Update weightage
    const updated = await prisma.goal.update({
      where: { id: goalId },
      data: { weightage: Number(weightage) },
    });

    res.json({
      message: "Weightage updated for shared goal",
      updated,
    });
  } catch (error) {
    console.error("Error updating weightage:", error);
    res.status(500).json({ error: "Failed to update weightage" });
  }
}

/**
 * Get shared goal status across all recipients
 */
export async function getSharedGoalStatus(req: Request, res: Response) {
  try {
    const { goalId } = req.params;

    const parentGoal = await prisma.goal.findUnique({
      where: { id: goalId },
      include: {
        sharedGoalChildren: {
          include: {
            goalSheet: {
              include: {
                user: true,
              },
            },
          },
        },
        primaryOwner: true,
      },
    });

    if (!parentGoal) {
      return res.status(404).json({ error: "Goal not found" });
    }

    const status = {
      parentGoal: {
        id: parentGoal.id,
        title: parentGoal.title,
        targetValue: parentGoal.targetValue,
        actualAchievement: parentGoal.actualAchievement,
        primaryOwner: parentGoal.primaryOwner?.name,
      },
      recipients: parentGoal.sharedGoalChildren.map((child) => ({
        goalId: child.id,
        employeeName: child.goalSheet.user.name,
        employeeEmail: child.goalSheet.user.email,
        weightage: child.weightage,
        actualAchievement: child.actualAchievement,
        completionStatus: child.completionStatus,
      })),
      totalRecipients: parentGoal.sharedGoalChildren.length,
      syncedAchievement: parentGoal.actualAchievement,
    };

    res.json(status);
  } catch (error) {
    console.error("Error fetching shared goal status:", error);
    res.status(500).json({ error: "Failed to fetch shared goal status" });
  }
}

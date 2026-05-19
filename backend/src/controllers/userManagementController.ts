import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

/**
 * Get all employees (Admin only)
 */
export async function getAllEmployees(req: Request, res: Response) {
  try {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Only admins can view all employees" });
    }

    const employees = await prisma.user.findMany({
      include: {
        manager: true,
        goalSheets: {
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });

    res.json(employees);
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({ error: "Failed to fetch employees" });
  }
}

/**
 * Create new employee (Admin only)
 */
export async function createEmployee(req: Request, res: Response) {
  try {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Only admins can create employees" });
    }

    const { name, email, managerId, role } = req.body;
    const userRole = role || "EMPLOYEE";

    if (!name || !email) {
      return res.status(400).json({ error: "Name and email are required" });
    }

    // FIX: Strictly normalize the email to lowercase to prevent Prisma unique constraint crashes
    const normalizedEmail = email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      return res.status(400).json({ error: "An account with this email already exists." });
    }

    if (userRole === "EMPLOYEE" && managerId) {
      const manager = await prisma.user.findUnique({
        where: { id: managerId },
      });
      if (!manager || manager.role !== "MANAGER") {
        return res.status(400).json({ error: "Invalid manager ID" });
      }
    }

    const employee = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        role: userRole,
        managerId: userRole === "EMPLOYEE" ? managerId || null : null,
      },
      include: {
        manager: true,
      },
    });

    res.status(201).json(employee);
  } catch (error) {
    console.error("Error creating employee:", error);
    res.status(500).json({ error: "Failed to create employee" });
  }
}

/**
 * Update employee (Admin only)
 */
export async function updateEmployee(req: Request, res: Response) {
  try {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Only admins can update employees" });
    }

    const { userId } = req.params;
    const { name, email, managerId, role } = req.body;

    const existing = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existing) {
      return res.status(404).json({ error: "User not found" });
    }

    // If email is being changed, check for duplicates
    if (email && email !== existing.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email },
      });
      if (emailExists) {
        return res.status(400).json({ error: "Email already exists" });
      }
    }

    const nextRole = role || existing.role;
    if (role && !["EMPLOYEE", "MANAGER", "ADMIN"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    if (nextRole === "EMPLOYEE" && managerId) {
      const manager = await prisma.user.findUnique({
        where: { id: managerId },
      });
      if (!manager || manager.role !== "MANAGER") {
        return res.status(400).json({ error: "Invalid manager ID" });
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name && { name }),
        ...(email && { email }),
        ...(role && { role }),
        ...(managerId !== undefined && {
          managerId: nextRole === "EMPLOYEE" ? managerId || null : null,
        }),
      },
      include: {
        manager: true,
        goalSheets: {
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    res.json(updated);
  } catch (error) {
    console.error("Error updating employee:", error);
    res.status(500).json({ error: "Failed to update employee" });
  }
}

/**
 * Delete employee (Admin only)
 * Cascades delete all related goal sheets and data
 */
export async function deleteEmployee(req: Request, res: Response) {
  try {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Only admins can delete employees" });
    }

    const { userId } = req.params;

    const existing = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existing) {
      return res.status(404).json({ error: "Employee not found" });
    }

    if (existing.id === req.user?.id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    if (existing.role === "MANAGER") {
      const reportCount = await prisma.user.count({
        where: { managerId: existing.id },
      });
      if (reportCount > 0) {
        return res.status(400).json({
          error: "Reassign direct reports before deleting this manager",
        });
      }
    }

    // Delete user-authored records that would otherwise try to null a non-nullable FK.
    // Goal sheets and their cascaded children are removed with the user itself.
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.checkInComment.deleteMany({
        where: { createdByUserId: userId },
      });

      await tx.auditLog.deleteMany({
        where: { changedByUserId: userId },
      });

      await tx.user.delete({
        where: { id: userId },
      });
    });

    res.json({ message: "Employee deleted successfully" });
  } catch (error) {
    console.error("Error deleting employee:", error);
    res.status(500).json({ error: "Failed to delete employee" });
  }
}

/**
 * Get all managers (Admin only)
 */
export async function getAllManagers(req: Request, res: Response) {
  try {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Only admins can view managers" });
    }

    const managers = await prisma.user.findMany({
      where: { role: "MANAGER" },
      include: {
        reports: {
          include: {
            goalSheets: {
              take: 1,
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    });

    res.json(managers);
  } catch (error) {
    console.error("Error fetching managers:", error);
    res.status(500).json({ error: "Failed to fetch managers" });
  }
}

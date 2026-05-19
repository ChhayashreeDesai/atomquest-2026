import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";

/**
 * Development Mode Auth Middleware
 * Resolves the authenticated user from X-User-Id (per-tab session isolation)
 * with role and simulated date from headers. Fails fast when identity is missing.
 */

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        role: "EMPLOYEE" | "MANAGER" | "ADMIN";
      };
      systemDate?: Date;
    }
  }
}

const VALID_ROLES = ["EMPLOYEE", "MANAGER", "ADMIN"] as const;

const systemDatePresets: Record<string, Date> = {
  may1: new Date(2026, 4, 1),
  july15: new Date(2026, 6, 15),
  oct15: new Date(2026, 9, 15),
  jan15: new Date(2027, 0, 15),
  apr15: new Date(2026, 3, 15),
};

function parseSystemDate(dateValue: string): Date | null {
  if (systemDatePresets[dateValue]) {
    return systemDatePresets[dateValue];
  }
  const parsed = new Date(dateValue);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function isPublicAuthRoute(req: Request): boolean {
  // Allow health check without authentication
  if (req.path === "/health") {
    return true;
  }
  // Allow system config without user ID (it only needs role/date)
  if (req.path === "/api/system/config") {
    return true;
  }
  // Allow login without authentication
  if (req.method === "POST" && req.path === "/api/auth/login") {
    return true;
  }
  return false;
}

export async function devAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Allow public routes to bypass strict ID checking and date validation
    if (isPublicAuthRoute(req)) {
      const roleHeader = (req.headers["x-dev-role"] as string) || "EMPLOYEE";
      const dateValue = (req.headers["x-system-date"] as string) || "2026-05-01";
      const systemDate = parseSystemDate(dateValue);
      req.systemDate = systemDate || new Date("2026-05-01");
      return next();
    }

    const roleHeader = (req.headers["x-dev-role"] as string) || "EMPLOYEE";
    const userIdHeader = req.headers["x-user-id"] as string | undefined;
    const dateValue = (req.headers["x-system-date"] as string) || "2026-05-01";

    const systemDate = parseSystemDate(dateValue);
    if (!systemDate) {
      return res.status(400).json({ error: "Invalid date format" });
    }
    req.systemDate = systemDate;

    // FIX: Fail fast. No more silent fallbacks to emp-001.
    if (!userIdHeader) {
      return res.status(401).json({ error: "Missing User ID header. Please log in again." });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: userIdHeader },
    });

    if (!dbUser) {
      return res.status(401).json({ error: "User profile not found. Please log in again." });
    }

    req.user = {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role as "EMPLOYEE" | "MANAGER" | "ADMIN",
    };
    
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
}

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden: Insufficient permissions" });
    }

    next();
  };
}

export function getSystemDate(req: Request): Date {
  return req.systemDate || new Date();
}

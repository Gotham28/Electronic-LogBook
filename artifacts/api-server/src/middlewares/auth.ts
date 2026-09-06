import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

import { JWT_SECRET } from "../lib/env.js";

export interface AuthUser {
  id: number;
  role: string;
  departmentId: number | null;
  sessionVersion: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.user) { next(); return; }
  // Check cookie or Authorization header
  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : req.cookies?.token;

  if (!token) {
    res.status(401).json({ message: "No token found in cookies or authorization header" });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as AuthUser & { scope?: string };
    // A payment token (scope: "payment") is issued to pending applicants who cannot pass
    // this check. It must never be accepted as a session token.
    if (decoded.scope === "payment") {
      res.status(401).json({ message: "Invalid session" });
      return;
    }
    if (!Number.isSafeInteger(decoded.id) || decoded.id <= 0) {
      res.status(401).json({ message: "Invalid session" });
      return;
    }
    // A signed token is identity evidence, not a cached authorization decision.
    const [account] = await db.select({ id: usersTable.id, role: usersTable.role,
      departmentId: usersTable.departmentId, status: usersTable.status,
      sessionVersion: usersTable.sessionVersion }).from(usersTable).where(eq(usersTable.id, decoded.id)).limit(1);
    if (!account || account.status !== "approved" || account.sessionVersion !== (decoded.sessionVersion ?? 0)) {
      res.status(401).json({ message: "Session is no longer active. Please sign in again." });
      return;
    }
    if (["student", "professor", "hod"].includes(account.role) && !account.departmentId) {
      res.status(403).json({ message: "Your account must be assigned to a department" });
      return;
    }
    req.user = account;
    next();
  } catch (error: any) {
    if (error.name === "TokenExpiredError") {
      res.status(401).json({ message: "Token expired" });
    } else if (error.name === "JsonWebTokenError" || error.name === "NotBeforeError") {
      res.status(401).json({ message: "Invalid or unavailable session" });
    } else {
      next(error);
    }
  }
}

export function requireDepartment(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !Number.isSafeInteger(req.user.departmentId) || req.user.departmentId! <= 0) {
    res.status(403).json({ message: "A department assignment is required" });
    return;
  }
  next();
}

export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }
    
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ message: "Forbidden: Insufficient role permissions" });
      return;
    }
    
    next();
  };
}

import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

import { JWT_SECRET } from "../lib/env.js";

export interface PaymentUser {
  id: number;
}

declare global {
  namespace Express {
    interface Request {
      paymentUser?: PaymentUser;
    }
  }
}

// A pending applicant cannot pass requireAuth, so payment routes use this instead. It never
// calls requireAuth and only ever admits a scope:"payment" token for a still-pending user.
export async function requirePaymentToken(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ message: "No payment token found in authorization header" });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as { id?: number; scope?: string };
    if (decoded.scope !== "payment" || !Number.isSafeInteger(decoded.id) || decoded.id! <= 0) {
      res.status(401).json({ message: "Invalid payment token" });
      return;
    }
    const [account] = await db.select({ id: usersTable.id, status: usersTable.status })
      .from(usersTable).where(eq(usersTable.id, decoded.id!)).limit(1);
    if (!account) {
      res.status(401).json({ message: "Invalid payment token" });
      return;
    }
    if (account.status !== "pending") {
      res.status(403).json({ message: "This account is not awaiting payment" });
      return;
    }
    req.paymentUser = { id: account.id };
    next();
  } catch (error: any) {
    if (error.name === "TokenExpiredError") {
      res.status(401).json({ message: "Payment token expired" });
    } else if (error.name === "JsonWebTokenError" || error.name === "NotBeforeError") {
      res.status(401).json({ message: "Invalid payment token" });
    } else {
      next(error);
    }
  }
}

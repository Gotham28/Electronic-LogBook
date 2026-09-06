import type { RequestHandler } from "express";
import { z } from "zod";

export const idSchema = z.coerce.number().int().positive().safe();
export const nameSchema = z.string().trim().min(1).max(160);
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(8).max(72).refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password must be at most 72 UTF-8 bytes");
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, "Invalid date");
export const targetSchema = z.coerce.number().int().min(0).max(100000);
export const configSchema = z.object({
  requiredCases: targetSchema, requiredProcedures: targetSchema, requiredAcademic: targetSchema,
  programDurationMonths: z.coerce.number().int().min(1).max(240).nullable(),
  casualLeaveAllowance: targetSchema.nullable(), academicLeaveAllowance: targetSchema.nullable(),
}).strict();

export function validate(schema: z.ZodTypeAny): RequestHandler {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
      return;
    }
    req.body = parsed.data;
    next();
  };
}

export function completionPercent(values: Array<[number, number | null | undefined]>): number {
  const configured = values.filter((v): v is [number, number] => typeof v[1] === "number" && v[1] > 0);
  if (!configured.length) return 0;
  return Math.round(configured.reduce((sum, [done, target]) => sum + Math.min(done / target, 1), 0) / configured.length * 100);
}

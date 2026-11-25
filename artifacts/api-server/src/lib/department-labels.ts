import { and, eq } from "drizzle-orm";
import { auditTable, db, departmentsTable, departmentLabelOverridesTable } from "@workspace/db";
import {
  DEPARTMENT_LABELS, DEPARTMENT_LABEL_KEYS, isDepartmentLabelKey, departmentLabelValueSchema, defaultDepartmentLabel,
  type DepartmentLabelKey, type DepartmentLabelContext,
} from "@workspace/api-zod";
import { resolveConfigDepartmentId } from "./department-config-source.js";
import { getDepartmentFeatures } from "./department-features.js";

// Per-department wording overrides, shared by the HOD route (actor "hod") and Mochi (actor "mochi").
// The department is always the caller's own (req.user.departmentId). Label values are display wording,
// not patient data, but they are never logged: only the key, department id and status.
export type DepartmentLabelActor = "hod" | "mochi";

export class DepartmentLabelError extends Error {
  constructor(public readonly status: 400 | 403 | 404 | 409, message: string) {
    super(message);
  }
}

// The milestone defaults follow the same effective wording flag the catalog uses (getDepartmentFeatures
// applies the same defaults for a department that has not set it). No department name is checked here.
export async function labelContext(departmentId: number): Promise<DepartmentLabelContext> {
  const { features } = await getDepartmentFeatures(departmentId);
  return { useThesisAndMandatoryCertificationsLabel: Boolean(features.useThesisAndMandatoryCertificationsLabel) };
}

export const labelView = (key: DepartmentLabelKey, override: { value: string; revision: number } | undefined, context: DepartmentLabelContext) => ({
  key,
  value: override?.value ?? defaultDepartmentLabel(key, context),
  default: defaultDepartmentLabel(key, context),
  override: override?.value ?? null,
  revision: override?.revision ?? 0,
  group: DEPARTMENT_LABELS[key].group,
});
export type DepartmentLabelView = ReturnType<typeof labelView>;

export type DepartmentLabelCurrent = { key: DepartmentLabelKey; value: string; default: string; override: string | null; revision: number };

// Read-only: the effective wording and the revision a later write must quote. Mirrored test departments
// read their config source's wording, exactly as the wording list does.
export async function getDepartmentLabel(departmentId: number, key: DepartmentLabelKey): Promise<DepartmentLabelCurrent> {
  const sourceId = await resolveConfigDepartmentId(departmentId);
  const [row] = await db.select().from(departmentLabelOverridesTable)
    .where(and(eq(departmentLabelOverridesTable.departmentId, sourceId), eq(departmentLabelOverridesTable.key, key))).limit(1);
  const context = await labelContext(departmentId);
  const { group: _group, ...rest } = labelView(key, row, context);
  return rest;
}

export async function listDepartmentLabels(departmentId: number) {
  const sourceId = await resolveConfigDepartmentId(departmentId);
  const rows = await db.select().from(departmentLabelOverridesTable).where(eq(departmentLabelOverridesTable.departmentId, sourceId));
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const context = await labelContext(departmentId);
  return {
    labels: DEPARTMENT_LABEL_KEYS.map((key) => ({ ...labelView(key, byKey.get(key), context),
      description: DEPARTMENT_LABELS[key].description, maxLength: DEPARTMENT_LABELS[key].maxLength })),
    readOnly: sourceId !== departmentId,
  };
}

export type DepartmentLabelChange = {
  view: DepartmentLabelView;
  // true when a reset actually removed an override (false: there was none to remove)
  reset: boolean;
  before: string | null; // override value before, null = no override
  after: string | null;  // override value after, null = no override
  auditId: string | null;
};

// `value: null` resets the key to its default. `revision` and `expectedValue` are both optional guards
// compared under the department row lock: a mismatch throws a 409 and nothing is written.
export async function setDepartmentLabel(input: {
  departmentId: number;
  userId: number; // usersTable.id of the person (or the person Mochi acts for), never studentsTable.id
  key: string;
  value: string | null;
  revision?: number;
  expectedValue?: string | null;
  actor: DepartmentLabelActor;
  undoOf?: string;
}): Promise<DepartmentLabelChange> {
  const { departmentId, userId, revision, expectedValue, actor, undoOf } = input;
  if (!isDepartmentLabelKey(input.key)) throw new DepartmentLabelError(404, "Unknown wording key");
  const key = input.key;
  let value: string | null = null;
  if (input.value !== null) {
    const parsed = departmentLabelValueSchema.safeParse(input.value);
    if (!parsed.success) throw new DepartmentLabelError(400, parsed.error.issues.map((issue) => issue.message).join("; "));
    value = parsed.data;
  }
  if (!Number.isSafeInteger(departmentId) || departmentId <= 0) throw new DepartmentLabelError(403, "A department assignment is required");
  if (await resolveConfigDepartmentId(departmentId) !== departmentId) {
    throw new DepartmentLabelError(403, "Test departments cannot modify mirrored settings");
  }
  const context = await labelContext(departmentId);
  return db.transaction(async (tx) => {
    // The department row lock serialises label edits for this department.
    await tx.select({ id: departmentsTable.id }).from(departmentsTable).where(eq(departmentsTable.id, departmentId)).for("update");
    const [current] = await tx.select().from(departmentLabelOverridesTable)
      .where(and(eq(departmentLabelOverridesTable.departmentId, departmentId), eq(departmentLabelOverridesTable.key, key))).limit(1);
    const currentRevision = current?.revision ?? 0;
    const conflict = () => new DepartmentLabelError(409, "This wording changed in another session. Reload before saving.");
    if (expectedValue !== undefined && expectedValue !== (current?.value ?? null)) throw conflict();
    // 2a behaviour kept: resetting a key that has no override is a no-op that never checks the revision.
    if (value === null && !current) return { view: labelView(key, undefined, context), reset: false, before: null, after: null, auditId: null };
    if (revision !== undefined && revision !== currentRevision) throw conflict();
    const before = current?.value ?? null;
    // Wording, the key and the actor only: nothing here can carry patient text or leave reasons.
    const audit = async (action: "CREATE" | "UPDATE" | "DELETE", after: string | null) => {
      const [row] = await tx.insert(auditTable).values({
        tableName: "department_label_overrides",
        recordId: String(departmentId),
        action,
        performedById: userId,
        beforeState: { eventType: "department_label_change", key, value: before },
        afterState: { eventType: "department_label_change", key, value: after, actor, ...(undoOf ? { undoOf } : {}) },
      }).returning({ id: auditTable.id });
      return row.id;
    };

    if (value === null) {
      await tx.delete(departmentLabelOverridesTable).where(eq(departmentLabelOverridesTable.id, current!.id)); // current exists: the no-override reset returned above
      return { view: labelView(key, undefined, context), reset: true, before, after: null, auditId: await audit("DELETE", null) };
    }
    const [saved] = current
      ? await tx.update(departmentLabelOverridesTable).set({ value, revision: current.revision + 1, updatedBy: userId, updatedAt: new Date() })
        .where(eq(departmentLabelOverridesTable.id, current.id)).returning()
      : await tx.insert(departmentLabelOverridesTable).values({ departmentId, key, value, updatedBy: userId }).returning();
    // Saving the same wording again keeps the 2a behaviour (the revision still moves) but is not a change to record.
    const auditId = before === value ? null : await audit(current ? "UPDATE" : "CREATE", value);
    return { view: labelView(key, saved, context), reset: false, before, after: value, auditId };
  });
}

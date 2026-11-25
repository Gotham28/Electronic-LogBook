import { eq } from "drizzle-orm";
import { auditTable, db, departmentConfigsTable, departmentsTable } from "@workspace/db";
import {
  DEPARTMENT_SETTING_TIERS, DEPARTMENT_SETTING_VALUE_TYPES, departmentSettingKeySchema, departmentSettingValueSchemas,
  type DepartmentSettingKey, type DepartmentSettingTier,
} from "@workspace/api-zod";
import { resolveConfigDepartmentId } from "./department-config-source.js";

export type DepartmentSettingActor = "hod" | "mochi";

export type DepartmentSettingView = {
  key: DepartmentSettingKey;
  tier: DepartmentSettingTier;
  valueType: "boolean";
  value: boolean | null;
};

export type DepartmentSettingChange = {
  key: DepartmentSettingKey;
  before: boolean | null;
  after: boolean;
  auditId: string | null;
};

export class DepartmentSettingError extends Error {
  constructor(public readonly status: 400 | 403 | 404 | 409, message: string) {
    super(message);
  }
}

// Stored values, not effective values: this reads the raw enabledFeatures[key] (null means unset) and
// deliberately does not call getDepartmentFeatures(), whose microbiology name-check defaults are
// being moved by task 2b. A caller's expectedValue is compared against this stored value.
function storedValue(features: Record<string, unknown> | null | undefined, key: DepartmentSettingKey): boolean | null {
  const value = features?.[key];
  return typeof value === "boolean" ? value : null;
}

export async function getDepartmentSettings(departmentId: number): Promise<DepartmentSettingView[]> {
  // Mirrored test departments read their source department's configuration.
  const configDepartmentId = await resolveConfigDepartmentId(departmentId);
  const [config] = await db.select({ enabledFeatures: departmentConfigsTable.enabledFeatures })
    .from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, configDepartmentId)).limit(1);
  return (Object.keys(DEPARTMENT_SETTING_TIERS) as DepartmentSettingKey[]).map((key) => ({
    key,
    tier: DEPARTMENT_SETTING_TIERS[key],
    valueType: DEPARTMENT_SETTING_VALUE_TYPES[key],
    value: storedValue(config?.enabledFeatures, key),
  }));
}

export async function setDepartmentSetting(input: {
  departmentId: number;
  userId: number; // usersTable.id of the person (or the person Mochi acts for), never studentsTable.id
  key: string;
  value: unknown;
  expectedValue: boolean | null;
  actor: DepartmentSettingActor;
  undoOf?: string; // audit id of the change this one reverses; written with the audit row, in the same transaction
}): Promise<DepartmentSettingChange> {
  const { departmentId, userId, expectedValue, actor, undoOf } = input;
  const parsedKey = departmentSettingKeySchema.safeParse(input.key);
  if (!parsedKey.success) throw new DepartmentSettingError(400, "Unknown setting");
  const key = parsedKey.data;

  // Tier is enforced here, before any database access, so no caller can skip it.
  if (actor !== "hod" && DEPARTMENT_SETTING_TIERS[key] !== "mochi") {
    throw new DepartmentSettingError(403, "This setting can only be changed by the HOD directly");
  }
  const parsedValue = departmentSettingValueSchemas[key].safeParse(input.value);
  if (!parsedValue.success) throw new DepartmentSettingError(400, "Invalid value for this setting");
  const value = parsedValue.data as boolean;

  if (!Number.isSafeInteger(departmentId) || departmentId <= 0) throw new DepartmentSettingError(403, "A department assignment is required");
  const [department] = await db.select({ configSourceDepartmentId: departmentsTable.configSourceDepartmentId })
    .from(departmentsTable).where(eq(departmentsTable.id, departmentId)).limit(1);
  if (!department) throw new DepartmentSettingError(404, "Department not found");
  if (department.configSourceDepartmentId !== null) {
    throw new DepartmentSettingError(403, "Test departments cannot modify mirrored settings");
  }

  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ enabledFeatures: departmentConfigsTable.enabledFeatures })
      .from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, departmentId)).limit(1).for("update");
    const before = storedValue(existing?.enabledFeatures, key);
    if (before !== expectedValue) throw new DepartmentSettingError(409, "This setting changed since you loaded it. Reload and try again.");
    if (before === value) return { key, before, after: value, auditId: null };

    if (existing) {
      await tx.update(departmentConfigsTable).set({ enabledFeatures: { ...existing.enabledFeatures, [key]: value } })
        .where(eq(departmentConfigsTable.departmentId, departmentId));
    } else {
      // No row yet: insert only this key. The column default (procedureExperience: true) is NOT applied,
      // because that would silently change a second setting.
      const inserted = await tx.insert(departmentConfigsTable).values({ departmentId, enabledFeatures: { [key]: value } })
        .onConflictDoNothing().returning({ id: departmentConfigsTable.id });
      // A concurrent insert for the same department won the unique department_id constraint.
      if (!inserted.length) throw new DepartmentSettingError(409, "This setting changed since you loaded it. Reload and try again.");
    }

    // Setting keys and booleans only: nothing here can carry patient text or leave reasons.
    const [audit] = await tx.insert(auditTable).values({
      tableName: "department_configs",
      recordId: String(departmentId),
      action: existing ? "UPDATE" : "CREATE",
      performedById: userId,
      beforeState: { eventType: "department_setting_change", key, value: before },
      afterState: { eventType: "department_setting_change", key, value, actor, ...(undoOf ? { undoOf } : {}) },
    }).returning({ id: auditTable.id });
    return { key, before, after: value, auditId: audit.id };
  });
}

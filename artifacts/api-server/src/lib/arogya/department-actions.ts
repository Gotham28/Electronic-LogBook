import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { auditTable, db } from "@workspace/db";
import {
  DEPARTMENT_LABELS, DEPARTMENT_SETTING_TIERS, departmentLabelValueSchema, departmentSettingKeySchema,
  isDepartmentLabelKey, type DepartmentLabelKey, type DepartmentSettingKey,
} from "@workspace/api-zod";
import { DepartmentLabelError, getDepartmentLabel, setDepartmentLabel } from "../department-labels.js";
import { getDepartmentFeatures } from "../department-features.js";
import { DepartmentSettingError, getDepartmentSettings, setDepartmentSetting } from "../department-settings.js";
import { containsSensitiveClinicalInput } from "./input-privacy.js";
import {
  isMochiActionType, mochiApplyBodySchema, mochiApplyEnvelopeSchema, mochiProposalSchema,
  type MochiApplyResponse, type MochiProposal, type MochiRefusal, type MochiUndoResponse,
} from "./department-action-schemas.js";

// Mochi's department edits (task 4). The allowlist is code, derived from the label and setting registries:
// it never comes from model output. Mochi may set or reset any registered wording key, and may switch
// the settings whose 3a tier is "mochi". Every other setting is "hod_only": Mochi refuses and links to the
// toggle. Nothing in this file is reachable without the signed-in HOD's own department and Confirm.

// Off unless exactly "true". The developer sets it; nothing in the code base does.
export const hodEditsEnabled = (): boolean => process.env.AROGYA_HOD_EDITS_ENABLED === "true";

// Department Settings is the "requirements" page in the HOD portal.
export const DEPARTMENT_SETTINGS_HREF = "/requirements";

export const ALL_SETTING_KEYS = Object.keys(DEPARTMENT_SETTING_TIERS) as DepartmentSettingKey[];
export const MOCHI_SETTING_KEYS = ALL_SETTING_KEYS.filter((key) => DEPARTMENT_SETTING_TIERS[key] === "mochi");
export const isMochiSettingKey = (key: string): key is DepartmentSettingKey =>
  (MOCHI_SETTING_KEYS as string[]).includes(key);

// What each wording or navigation setting does, taken from how the application reads it. Settings without
// an entry are HOD-only and are only ever named, never described.
const SETTING_MEANINGS: Partial<Record<DepartmentSettingKey, string>> = {
  useThesisAndMandatoryCertificationsLabel: "Use \"Thesis and mandatory certifications\" wording for the thesis and certifications page",
  useThesisAndPublicationsLabel: "Say \"Thesis and publications\" instead of \"Thesis\" for the research page",
  useCaseTypeLabel: "Say \"Case type\" instead of \"Case category\" in the case log",
  academicsFirstInNav: "List academic activities before the log pages in the sidebar",
};
const humanize = (key: string) => {
  const words = key.replace(/([A-Z])/g, " $1").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};
export const settingTitle = (key: DepartmentSettingKey): string => SETTING_MEANINGS[key] ?? humanize(key);
export const labelTitle = (key: DepartmentLabelKey): string => DEPARTMENT_LABELS[key].description;

const onOff = (value: boolean | null) => value === null ? "Not set" : value ? "On" : "Off";

export class DepartmentActionError extends Error {
  constructor(public readonly status: 400 | 403 | 404 | 409, message: string) {
    super(message);
  }
}
// The status and message of any error the apply and undo paths can raise; anything else is a 500.
export function actionErrorStatus(error: unknown): { status: 400 | 403 | 404 | 409; message: string } | null {
  if (error instanceof DepartmentActionError || error instanceof DepartmentLabelError || error instanceof DepartmentSettingError) {
    return { status: error.status, message: error.message };
  }
  return null;
}

export type ProposalRequest =
  | { type: "label_set"; key: string; value: string }
  | { type: "label_reset"; key: string }
  | { type: "setting_set"; key: string; value: boolean };

export type Classified =
  | { kind: "proposal"; proposal: MochiProposal }
  | { kind: "hod_only_refusal"; refusal: Extract<MochiRefusal, { type: "hod_only" }> }
  | { kind: "unsupported" };

// Reads the current value and the revision or stored value an apply must quote. No write.
export async function buildProposal(departmentId: number, request: ProposalRequest): Promise<MochiProposal> {
  if (request.type === "setting_set") {
    const key = departmentSettingKeySchema.parse(request.key);
    const [settings, { features }] = await Promise.all([
      getDepartmentSettings(departmentId),
      getDepartmentFeatures(departmentId),
    ]);
    const stored = settings.find((setting) => setting.key === key)?.value ?? null;
    const effective = typeof features[key] === "boolean" ? features[key] : stored;
    return mochiProposalSchema.parse({ type: "setting_set", key, title: settingTitle(key), before: onOff(effective),
      after: onOff(request.value), value: request.value, expected: stored });
  }
  if (!isDepartmentLabelKey(request.key)) throw new DepartmentActionError(404, "Unknown wording key");
  const key = request.key;
  const current = await getDepartmentLabel(departmentId, key);
  if (request.type === "label_reset") {
    return mochiProposalSchema.parse({ type: "label_reset", key, title: labelTitle(key), before: current.value,
      after: current.default, expected: current.revision });
  }
  const value = departmentLabelValueSchema.parse(request.value);
  return mochiProposalSchema.parse({ type: "label_set", key, title: labelTitle(key), before: current.value,
    after: value, value, expected: current.revision });
}

// Decides what a model-chosen request becomes. Unknown actions, unknown keys, bad or clinical-looking values
// are "unsupported". A HOD-only setting is a refusal that links to its toggle. Only allowlisted requests
// reach buildProposal.
export async function classifyAction(departmentId: number, request: unknown): Promise<Classified> {
  if (!request || typeof request !== "object") return { kind: "unsupported" };
  const candidate = request as Record<string, unknown>;
  if (!isMochiActionType(candidate.type) || typeof candidate.key !== "string") return { kind: "unsupported" };
  try {
    if (candidate.type === "setting_set") {
      const parsedKey = departmentSettingKeySchema.safeParse(candidate.key);
      if (!parsedKey.success) return { kind: "unsupported" };
      if (!isMochiSettingKey(parsedKey.data)) {
        return { kind: "hod_only_refusal", refusal: { type: "hod_only", key: parsedKey.data,
          title: settingTitle(parsedKey.data), settingsHref: DEPARTMENT_SETTINGS_HREF } };
      }
      if (typeof candidate.value !== "boolean") return { kind: "unsupported" };
      return { kind: "proposal", proposal: await buildProposal(departmentId, { type: "setting_set", key: parsedKey.data, value: candidate.value }) };
    }
    if (!isDepartmentLabelKey(candidate.key)) return { kind: "unsupported" };
    if (candidate.type === "label_reset") {
      return { kind: "proposal", proposal: await buildProposal(departmentId, { type: "label_reset", key: candidate.key }) };
    }
    const value = departmentLabelValueSchema.safeParse(candidate.value);
    if (!value.success || containsSensitiveClinicalInput(value.data)) return { kind: "unsupported" };
    return { kind: "proposal", proposal: await buildProposal(departmentId, { type: "label_set", key: candidate.key, value: value.data }) };
  } catch (error) {
    if (actionErrorStatus(error)) return { kind: "unsupported" };
    throw error;
  }
}

type ActionUser = { id: number; departmentId: number | null };
const departmentOf = (user: ActionUser): number => {
  if (!Number.isSafeInteger(user.departmentId) || user.departmentId! <= 0) throw new DepartmentActionError(403, "A department assignment is required");
  return user.departmentId!;
};

// Applies one previewed action for the signed-in HOD's own department. The body is untrusted: the type, key,
// tier, value and the previewed `expected` value are all checked again here.
export async function applyAction(user: ActionUser, body: unknown): Promise<MochiApplyResponse> {
  const departmentId = departmentOf(user);
  const envelope = mochiApplyEnvelopeSchema.safeParse(body);
  if (!envelope.success) throw new DepartmentActionError(400, "Invalid request");
  const { type, key } = envelope.data;
  if (!isMochiActionType(type)) throw new DepartmentActionError(404, "Unknown action");
  if (type === "setting_set") {
    if (!departmentSettingKeySchema.safeParse(key).success) throw new DepartmentActionError(404, "Unknown setting");
    if (!isMochiSettingKey(key)) throw new DepartmentActionError(403, "This setting can only be changed by the HOD directly");
  } else if (!isDepartmentLabelKey(key)) {
    throw new DepartmentActionError(404, "Unknown wording key");
  }
  const parsed = mochiApplyBodySchema.safeParse(body);
  if (!parsed.success) throw new DepartmentActionError(400, "Invalid request");
  const action = parsed.data;

  if (action.type === "setting_set") {
    const { features } = await getDepartmentFeatures(departmentId);
    const change = await setDepartmentSetting({ departmentId, userId: user.id, key: action.key, value: action.value,
      expectedValue: action.expected, actor: "mochi" });
    const effectiveBefore = typeof features[action.key] === "boolean" ? features[action.key] : change.before;
    return { auditId: change.auditId, before: onOff(effectiveBefore), after: onOff(change.after),
      undoable: change.auditId !== null && change.before !== null };
  }
  if (action.type === "label_set" && containsSensitiveClinicalInput(action.value)) {
    throw new DepartmentActionError(400, "Wording cannot contain patient details");
  }
  const change = await setDepartmentLabel({ departmentId, userId: user.id, key: action.key,
    value: action.type === "label_set" ? action.value : null, revision: action.expected, actor: "mochi" });
  return { auditId: change.auditId, before: change.before ?? change.view.default, after: change.after ?? change.view.default,
    undoable: change.auditId !== null };
}

const auditIdSchema = z.string().uuid();
const stateSchema = z.object({ eventType: z.string(), key: z.string(), value: z.union([z.string(), z.boolean(), z.null()]), actor: z.string().optional() })
  .passthrough();

// Restores the `before` value of one earlier Mochi change, but only while the value is still the one that
// change wrote and the change has not already been undone.
export async function undoAction(user: ActionUser, auditId: string): Promise<MochiUndoResponse> {
  const departmentId = departmentOf(user);
  if (!auditIdSchema.safeParse(auditId).success) throw new DepartmentActionError(400, "Invalid change id");
  const [row] = await db.select().from(auditTable).where(eq(auditTable.id, auditId)).limit(1);
  const before = stateSchema.safeParse(row?.beforeState);
  const after = stateSchema.safeParse(row?.afterState);
  const isLabel = row?.tableName === "department_label_overrides" && after.success && after.data.eventType === "department_label_change";
  const isSetting = row?.tableName === "department_configs" && after.success && after.data.eventType === "department_setting_change";
  if (!row || !before.success || !after.success || !(isLabel || isSetting) || after.data.actor !== "mochi") {
    throw new DepartmentActionError(404, "Change not found");
  }
  // The department comes from the signed-in HOD (usersTable), never from the request.
  if (row.recordId !== String(departmentId)) throw new DepartmentActionError(403, "This change belongs to another department");

  const [undone] = await db.select({ id: auditTable.id }).from(auditTable)
    .where(and(eq(auditTable.tableName, row.tableName), eq(auditTable.recordId, row.recordId),
      sql`${auditTable.afterState}->>'undoOf' = ${auditId}`)).limit(1);
  if (undone) throw new DepartmentActionError(409, "This change was already undone.");

  const key = after.data.key;
  if (isLabel) {
    if (!isDepartmentLabelKey(key)) throw new DepartmentActionError(404, "Change not found");
    if ((before.data.value !== null && typeof before.data.value !== "string") || (after.data.value !== null && typeof after.data.value !== "string")) {
      throw new DepartmentActionError(404, "Change not found");
    }
    const change = await setDepartmentLabel({ departmentId, userId: user.id, key, value: before.data.value as string | null,
      expectedValue: after.data.value as string | null, actor: "mochi", undoOf: auditId });
    return { auditId: change.auditId, before: change.before ?? change.view.default, after: change.after ?? change.view.default };
  }
  if (!departmentSettingKeySchema.safeParse(key).success || typeof after.data.value !== "boolean" ||
    (before.data.value !== null && typeof before.data.value !== "boolean")) throw new DepartmentActionError(404, "Change not found");
  if (before.data.value === null) {
    // The setting was unset before this change and the setting service cannot restore "unset".
    throw new DepartmentActionError(409, "This setting was not set before the change, so it cannot be undone automatically. Switch it back in Department Settings.");
  }
  const change = await setDepartmentSetting({ departmentId, userId: user.id, key, value: before.data.value,
    expectedValue: after.data.value, actor: "mochi", undoOf: auditId });
  return { auditId: change.auditId, before: onOff(change.before), after: onOff(change.after) };
}

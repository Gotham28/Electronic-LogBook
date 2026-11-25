import { z } from "zod";
import { DEPARTMENT_LABEL_KEYS, departmentLabelValueSchema, departmentSettingKeySchema } from "@workspace/api-zod";

// Zod schemas for Mochi's department edits (task 4). The plan placed these in lib/api-zod; the write guard
// does not allow that folder from this session, so they live beside the allowlist that uses them (see
// HANDOFF.md). Moving them is a mechanical follow-up.
//
// Mochi maps a request to exactly one of these structured actions, shows the HOD a preview, and only the
// HOD's Confirm applies it. The allowlist itself is in department-actions.ts and is derived from the label
// and setting registries.
export const MOCHI_ACTION_TYPES = ["label_set", "label_reset", "setting_set"] as const;
export type MochiActionType = typeof MOCHI_ACTION_TYPES[number];
export const isMochiActionType = (value: unknown): value is MochiActionType =>
  typeof value === "string" && (MOCHI_ACTION_TYPES as readonly string[]).includes(value);

const labelKeySchema = z.enum(DEPARTMENT_LABEL_KEYS as [string, ...string[]]);
const revisionSchema = z.number().int().min(0).max(2_147_483_647);

// A preview. `expected` is what the server saw when it built the preview: the label's revision, or the
// stored setting value (null = unset). Apply sends it back and gets a 409 if the value moved since.
export const mochiProposalSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("label_set"), key: labelKeySchema, title: z.string(), before: z.string(), after: z.string(),
    value: z.string(), expected: revisionSchema }).strict(),
  z.object({ type: z.literal("label_reset"), key: labelKeySchema, title: z.string(), before: z.string(), after: z.string(),
    expected: revisionSchema }).strict(),
  z.object({ type: z.literal("setting_set"), key: departmentSettingKeySchema, title: z.string(), before: z.string(), after: z.string(),
    value: z.boolean(), expected: z.boolean().nullable() }).strict(),
]);
export type MochiProposal = z.infer<typeof mochiProposalSchema>;

// A request Mochi will not make for the HOD: a HOD-only setting (with the link to its toggle) or anything
// outside the allowlist (the panel then offers a support ticket).
export const mochiRefusalSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hod_only"), key: departmentSettingKeySchema, title: z.string(), settingsHref: z.string() }).strict(),
  z.object({ type: z.literal("unsupported") }).strict(),
]);
export type MochiRefusal = z.infer<typeof mochiRefusalSchema>;

// The shape check for the apply body before the key/type allowlist, so an unknown type or key can be a 404
// and a malformed or padded body a 400. The department is never in it: the server uses the signed-in HOD's own.
export const mochiApplyEnvelopeSchema = z.object({
  type: z.string(), key: z.string(), value: z.unknown().optional(), expected: z.unknown().optional(),
}).strict();

export const mochiApplyBodySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("label_set"), key: labelKeySchema, value: departmentLabelValueSchema, expected: revisionSchema }).strict(),
  z.object({ type: z.literal("label_reset"), key: labelKeySchema, expected: revisionSchema }).strict(),
  z.object({ type: z.literal("setting_set"), key: departmentSettingKeySchema, value: z.boolean(), expected: z.boolean().nullable() }).strict(),
]);
export type MochiApplyBody = z.infer<typeof mochiApplyBodySchema>;

// `auditId` is null when the request changed nothing. `undoable` is false when the audit row cannot restore
// the previous state (a setting that was unset before the change).
export const mochiApplyResponseSchema = z.object({
  auditId: z.string().uuid().nullable(), before: z.string(), after: z.string(), undoable: z.boolean(),
}).strict();
export type MochiApplyResponse = z.infer<typeof mochiApplyResponseSchema>;

export const mochiUndoResponseSchema = z.object({
  auditId: z.string().uuid().nullable(), before: z.string(), after: z.string(),
}).strict();
export type MochiUndoResponse = z.infer<typeof mochiUndoResponseSchema>;

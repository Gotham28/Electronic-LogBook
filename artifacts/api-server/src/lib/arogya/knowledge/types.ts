export type ArogyaRole = "student" | "professor" | "hod";

export type WorkflowAvailability =
  | { key: string; enabledWhen: boolean }
  | { key: string; enabledWhen: "not-true" };

export interface WorkflowEntry {
  id: string;
  title: string;
  roles: readonly ArogyaRole[];
  aliases: readonly string[];
  availability?: WorkflowAvailability;
  unavailableWhen?: readonly WorkflowAvailability[];
  href?: string;
  steps: readonly string[];
  rules: readonly string[];
  blockers: readonly string[];
  sources: readonly string[];
}

export interface RetrievedWorkflow extends WorkflowEntry {
  available: boolean;
  href?: string;
}

export interface ArogyaAction {
  id: string;
  label: string;
  href: string;
}

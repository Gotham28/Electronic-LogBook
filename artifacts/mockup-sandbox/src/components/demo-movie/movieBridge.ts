export const ARO_DEMO_COMMAND_EVENT = "arogya-demo-command";

export type AroDemoCommand =
  | { type: "ask"; question: string }
  | { type: "progress-coach" }
  | { type: "department-report"; reportType: "report" | "falling_behind" }
  | { type: "appraisal-prefill-and-draft" };

export function sendAroDemoCommand(command: AroDemoCommand): void {
  window.dispatchEvent(new CustomEvent(ARO_DEMO_COMMAND_EVENT, { detail: command }));
}

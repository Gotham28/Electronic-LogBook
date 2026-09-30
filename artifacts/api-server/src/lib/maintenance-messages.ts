export type MaintenanceNoticeKind = "scheduled" | "active";

export function formatMaintenanceTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  })} IST`;
}

export function buildMaintenanceNotice(startAt: Date | string, endAt: Date | string, kind: MaintenanceNoticeKind) {
  const start = formatMaintenanceTime(startAt);
  const end = formatMaintenanceTime(endAt);
  switch (kind) {
    case "active":
      return {
        heading: "ELogbook service notice",
        message: `ELogbook maintenance is in progress until ${end}. Please save your work regularly; you may experience brief interruptions. Thank you for your understanding.`,
      };
    default:
      return {
        heading: "ELogbook scheduled maintenance",
        message: `ELogbook is scheduled for maintenance from ${start} to ${end}. Please save your work beforehand, as you may experience brief interruptions during this time. Thank you for your understanding.`,
      };
  }
}

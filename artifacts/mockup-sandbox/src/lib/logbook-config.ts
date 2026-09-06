export function formatLogbookDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value.toString();
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

export function todayForInput(): string {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function expectedCompletionDate(joiningDate: string, durationMonths?: number | null): string {
  if (!joiningDate || !durationMonths) return "";
  const [year, month, day] = joiningDate.split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(year, month - 1 + durationMonths, day);
  if (Number.isNaN(date.getTime())) return "";
  const completionYear = date.getFullYear();
  const completionMonth = String(date.getMonth() + 1).padStart(2, "0");
  const completionDay = String(date.getDate()).padStart(2, "0");
  return `${completionYear}-${completionMonth}-${completionDay}`;
}

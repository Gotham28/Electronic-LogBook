export function formatLogbookDate(value: string | Date | undefined | null): string {
  if (!value) return "—";
  if (typeof value === "string" && value.includes(" to ")) {
    const [start, end] = value.split(" to ");
    const formattedStart = formatLogbookDate(start.trim());
    const formattedEnd = formatLogbookDate(end.trim());
    if (formattedStart !== "—" && formattedEnd !== "—") {
      return `${formattedStart} to ${formattedEnd}`;
    }
  }
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : "—";
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



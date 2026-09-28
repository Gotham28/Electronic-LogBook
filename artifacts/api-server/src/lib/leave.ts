export function splitLeaveDaysByYear(startDate: string, endDate: string): { year: string; days: number }[] {
  if (!startDate || !endDate) return [];
  const startStr = startDate.slice(0, 10);
  const endStr = endDate.slice(0, 10);
  
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) return [];
  
  const start = new Date(`${startStr}T00:00:00Z`);
  const end = new Date(`${endStr}T00:00:00Z`);
  
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
  
  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();
  
  if (endYear - startYear > 100) return [];
  
  if (startYear === endYear) {
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    return [{ year: startYear.toString(), days }];
  }
  
  const splits: { year: string; days: number }[] = [];
  
  for (let y = startYear; y <= endYear; y++) {
    let yearStart = new Date(`${y}-01-01T00:00:00Z`);
    let yearEnd = new Date(`${y}-12-31T00:00:00Z`);
    
    if (y === startYear) yearStart = start;
    if (y === endYear) yearEnd = end;
    
    const days = Math.round((yearEnd.getTime() - yearStart.getTime()) / 86400000) + 1;
    splits.push({ year: y.toString(), days });
  }
  
  return splits;
}

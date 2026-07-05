export interface CalendarGridCell {
  key: string;
  date: Date | null;
  day: number | null;
}

export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildMonthGrid(currentMonth: Date): CalendarGridCell[][] {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const leadingBlankCount = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: CalendarGridCell[] = [];

  for (let index = 0; index < leadingBlankCount; index += 1) {
    cells.push({ key: `before-${index}`, date: null, day: null });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    cells.push({ key: toLocalDateKey(date), date, day });
  }

  const trailingBlankCount = (7 - (cells.length % 7)) % 7;
  for (let index = 0; index < trailingBlankCount; index += 1) {
    cells.push({ key: `after-${index}`, date: null, day: null });
  }

  return Array.from({ length: cells.length / 7 }, (_, rowIndex) => cells.slice(rowIndex * 7, rowIndex * 7 + 7));
}

export function moveMonth(currentMonth: Date, offset: number): Date {
  return new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1);
}

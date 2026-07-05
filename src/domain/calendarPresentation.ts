import type { CalendarSlot, DisplaySlotStatus } from './types';

export const calendarActionPriority: DisplaySlotStatus[] = [
  'available',
  'few',
  'full',
  'adjusting',
  'paused',
  'cancelled',
  'outside',
];

function statusRank(status: DisplaySlotStatus): number {
  const rank = calendarActionPriority.indexOf(status);
  return rank === -1 ? calendarActionPriority.length : rank;
}

export function resolveCalendarDayStatus(slots: Pick<CalendarSlot, 'displayStatus'>[]): DisplaySlotStatus {
  return slots.reduce<DisplaySlotStatus>(
    (best, slot) => statusRank(slot.displayStatus) < statusRank(best) ? slot.displayStatus : best,
    'outside',
  );
}

export function selectInitialCalendarDate(slots: Pick<CalendarSlot, 'displayStatus' | 'startAt'>[]): string | null {
  const selected = [...slots].sort((left, right) => (
    statusRank(left.displayStatus) - statusRank(right.displayStatus)
      || left.startAt.localeCompare(right.startAt)
  ))[0];
  return selected?.startAt ?? null;
}

export function visibleCalendarStatuses(slots: Pick<CalendarSlot, 'displayStatus'>[]): DisplaySlotStatus[] {
  const statuses = new Set(slots.map((slot) => slot.displayStatus));
  return calendarActionPriority.filter((status) => status !== 'outside' && statuses.has(status));
}

import { addWeeks, startOfDay } from 'date-fns';
import type { Booking, CalendarSlot, DisplaySlotStatus, Party, Prices, Slot, SlotCreateInput, WaitlistEntry } from './types';

export const MAX_GROUP_SIZE = 10;

export function partyTotal(party: Party): number {
  return party.adults + party.children + party.infants;
}

export function calculatePrice(party: Party, prices: Prices): number {
  return party.adults * prices.adult + party.children * prices.child + party.infants * prices.infant;
}

export function confirmedPeople(bookings: Booking[], slotId: string): number {
  return bookings
    .filter((booking) => booking.slotId === slotId && (booking.status === 'confirmed' || booking.status === 'checkedIn'))
    .reduce((sum, booking) => sum + booking.totalPeople, 0);
}

export function resolveDisplayStatus(slot: Slot, bookedPeople: number, now = new Date()): DisplaySlotStatus {
  if (slot.manualStatus === 'cancelled') return 'cancelled';
  if (slot.manualStatus === 'adjusting') return 'adjusting';
  if (slot.manualStatus === 'paused') return 'paused';
  if (now < new Date(slot.bookingOpenAt) || now > new Date(slot.bookingCloseAt)) return 'outside';

  const remaining = Math.max(0, slot.capacity - bookedPeople);
  if (remaining === 0) return 'full';
  if (remaining <= slot.fewThreshold) return 'few';
  return 'available';
}

export function toCalendarSlot(slot: Slot, bookings: Booking[], experience: CalendarSlot['experience'], now = new Date()): CalendarSlot {
  const booked = confirmedPeople(bookings, slot.id);
  return {
    ...slot,
    experience,
    bookedPeople: booked,
    remaining: Math.max(0, slot.capacity - booked),
    displayStatus: resolveDisplayStatus(slot, booked, now),
  };
}

export function assertParty(party: Party): void {
  const values = [party.adults, party.children, party.infants];
  if (values.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new Error('人数は0以上の整数で入力してください。');
  }
  const total = partyTotal(party);
  if (total < 1) throw new Error('参加人数を1人以上選んでください。');
  if (total > MAX_GROUP_SIZE) throw new Error('11人以上のグループは農園へお電話ください。');
}

export function canBookSlot(slot: CalendarSlot, party: Party): boolean {
  const acceptsBookings = slot.displayStatus === 'available' || slot.displayStatus === 'few';
  return slot.publicationStatus === 'published' && acceptsBookings && slot.remaining >= partyTotal(party);
}

export function canJoinWaitlist(slot: CalendarSlot, party: Party): boolean {
  const acceptsRequests = slot.displayStatus === 'available' || slot.displayStatus === 'few';
  const lacksSeats = slot.remaining < partyTotal(party);
  return slot.publicationStatus === 'published' && (slot.displayStatus === 'full' || (acceptsRequests && lacksSeats));
}

export function getSlotCallToAction(slot: CalendarSlot, now = new Date()): {
  kind: 'booking' | 'waitlist' | 'unavailable';
  label: string;
  message: string;
} {
  if (slot.displayStatus === 'available' || slot.displayStatus === 'few') {
    return { kind: 'booking', label: '予約へ進む', message: `現在、あと${slot.remaining}名ご参加いただけます。` };
  }
  if (slot.displayStatus === 'full') {
    return { kind: 'waitlist', label: 'キャンセル待ちへ', message: '満員のため、キャンセル待ちを受け付けています。' };
  }
  if (slot.displayStatus === 'adjusting') {
    return { kind: 'unavailable', label: '生育調整中', message: slot.statusReason || '生育状況を確認しているため、現在は予約を受け付けていません。' };
  }
  if (slot.displayStatus === 'paused') {
    return { kind: 'unavailable', label: '受付停止中', message: slot.statusReason || '農園の判断により、現在は予約受付を停止しています。' };
  }
  if (slot.displayStatus === 'cancelled') {
    return { kind: 'unavailable', label: '開催中止', message: slot.statusReason || 'この体験は開催中止となりました。' };
  }
  const beforeOpening = now < new Date(slot.bookingOpenAt);
  return {
    kind: 'unavailable',
    label: beforeOpening ? '受付開始前' : '受付終了',
    message: beforeOpening
      ? `予約受付は${new Date(slot.bookingOpenAt).toLocaleString('ja-JP')}から開始します。`
      : 'この開催枠の予約受付は終了しました。',
  };
}

export function hasSlotHistory(bookings: Booking[], waitlistEntries: WaitlistEntry[], slotId: string): boolean {
  const hasBooking = bookings.some((booking) => booking.slotId === slotId);
  const hasWaitlist = waitlistEntries.some((entry) => entry.slotId === slotId);
  return hasBooking || hasWaitlist;
}

export function canDeleteSlot(bookings: Booking[], waitlistEntries: WaitlistEntry[], slotId: string): boolean {
  return !hasSlotHistory(bookings, waitlistEntries, slotId);
}

export function isContactNameCandidate(value: string): boolean {
  const length = value.trim().length;
  return length >= 2 && length <= 100;
}

export function isEmailCandidate(value: string): boolean {
  const candidate = value.trim();
  if (candidate.length < 3 || candidate.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate);
}

export function isPhoneCandidate(value: string): boolean {
  const candidate = value.trim();
  if (candidate.length < 8 || candidate.length > 32) return false;
  return /^[0-9()+\-\s]+$/.test(candidate);
}

export function assertSlotInput(input: SlotCreateInput, now = new Date()): void {
  const start = new Date(input.startAt);
  const end = new Date(input.endAt);
  const bookingOpen = new Date(input.bookingOpenAt);
  const bookingClose = new Date(input.bookingCloseAt);
  const cancellation = new Date(input.cancellationDeadline);
  const dates = [start, end, bookingOpen, bookingClose, cancellation];

  if (dates.some((date) => Number.isNaN(date.getTime()))) throw new Error('日時の入力内容を確認してください。');
  if (start < startOfDay(now)) throw new Error('開催日は当日以降を指定してください。');
  if (start >= end) throw new Error('終了時刻は開始時刻より後にしてください。');
  if (bookingOpen >= bookingClose) throw new Error('受付開始は受付終了より前にしてください。');
  if (bookingClose >= start) throw new Error('受付終了は開催前にしてください。');
  if (cancellation >= start) throw new Error('キャンセル期限は開催前にしてください。');
  if (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 100) {
    throw new Error('定員は1〜100人の整数で入力してください。');
  }
  if (!Number.isInteger(input.fewThreshold) || input.fewThreshold < 1 || input.fewThreshold > input.capacity) {
    throw new Error('残りわずか基準は1以上、定員以下で入力してください。');
  }
  if (Object.values(input.prices).some((price) => !Number.isInteger(price) || price < 0)) {
    throw new Error('料金は0以上の整数で入力してください。');
  }
}

export function buildWeeklyDates(start: Date, end: Date, maxCount = 12): Date[] {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    throw new Error('毎週作成の終了日は開始日以降を指定してください。');
  }
  const dates: Date[] = [];
  for (let cursor = start; cursor <= end; cursor = addWeeks(cursor, 1)) {
    dates.push(cursor);
    if (dates.length > maxCount) throw new Error(`毎週作成は最大${maxCount}枠までです。`);
  }
  return dates;
}

export function yen(value: number): string {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(value);
}

export const statusLabels: Record<DisplaySlotStatus, string> = {
  available: '受付中',
  few: '残りわずか',
  full: '満員',
  adjusting: '生育調整中',
  paused: '受付停止',
  cancelled: '開催中止',
  outside: '受付期間外',
};

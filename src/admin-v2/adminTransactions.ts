export const AUDIT_LOGS_KEY = 'auditLogs';
export const PHONE_BOOKINGS_KEY = 'adminV2PhoneBookings';
export const NOTIFICATION_QUEUE_KEY = 'adminV2NotificationQueue';
export const BULK_CANCELLATIONS_KEY = 'adminV2BulkCancellations';
export const ADMIN_AUDIT_UPDATED_EVENT = 'admin-v2-audit-updated';
const DEMO_PHONE_CONTACT = {
  name: 'デモ電話予約者',
  phone: '000-0000-0000',
  email: 'demo@example.invalid',
};

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PhoneBookingDraft {
  date: string;
  slotId: string;
  slotLabel: string;
  name: string;
  phone: string;
  email?: string;
}

export interface SavedPhoneBooking extends PhoneBookingDraft {
  id: string;
  source: 'phone';
  status: 'confirmed' | 'slotCanceled';
  notification: 'queued' | 'skipped';
  createdAt: string;
}

export interface NotificationQueueItem {
  id: string;
  bookingId: string;
  recipientEmail: string;
  status: 'queued';
  createdAt: string;
}

export interface BulkCancellationRecord {
  id: string;
  date: string;
  affectedBookings: number;
  affectedUsers: number;
  reason: string;
  createdAt: string;
}

export interface AdminAuditLog {
  id: string;
  action: 'phoneBooking.created' | 'notification.queued' | 'bulkCancellation.completed' | 'demo.reset';
  summary: string;
  details: Record<string, string | number | boolean>;
  createdAt: string;
}

type IdFactory = () => string;

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `admin-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readArray<T>(storage: StorageLike, key: string): T[] {
  const stored = storage.getItem(key);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function writeArray<T>(storage: StorageLike, key: string, items: T[]): void {
  storage.setItem(key, JSON.stringify(items));
}

function emitAuditUpdated(storage: StorageLike): void {
  if (typeof window !== 'undefined' && storage === window.localStorage) {
    window.dispatchEvent(new CustomEvent(ADMIN_AUDIT_UPDATED_EVENT));
  }
}

function appendAuditLog(
  storage: StorageLike,
  input: Omit<AdminAuditLog, 'id' | 'createdAt'>,
  now: Date,
  idFactory: IdFactory,
): AdminAuditLog {
  const log: AdminAuditLog = {
    ...input,
    id: idFactory(),
    createdAt: now.toISOString(),
  };
  writeArray(storage, AUDIT_LOGS_KEY, [log, ...readArray<AdminAuditLog>(storage, AUDIT_LOGS_KEY)]);
  emitAuditUpdated(storage);
  return log;
}

function assertPhoneBooking(input: PhoneBookingDraft): void {
  if (!input.date || !input.slotId) throw new Error('開催日と時間枠を選択してください。');
  if (input.name.trim().length < 2) throw new Error('お名前を2文字以上で入力してください。');
  if (!/^[0-9()+\-\s]{8,32}$/.test(input.phone.trim())) throw new Error('電話番号の形式を確認してください。');
  const email = input.email?.trim() ?? '';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('メールアドレスの形式を確認してください。');
}

export function createPhoneBooking(
  storage: StorageLike,
  draft: PhoneBookingDraft,
  now = new Date(),
  idFactory: IdFactory = makeId,
): SavedPhoneBooking {
  assertPhoneBooking(draft);
  const email = draft.email?.trim() ?? '';
  const booking: SavedPhoneBooking = {
    ...draft,
    name: DEMO_PHONE_CONTACT.name,
    phone: DEMO_PHONE_CONTACT.phone,
    email: email ? DEMO_PHONE_CONTACT.email : '',
    id: idFactory(),
    source: 'phone',
    status: 'confirmed',
    notification: email ? 'queued' : 'skipped',
    createdAt: now.toISOString(),
  };

  writeArray(storage, PHONE_BOOKINGS_KEY, [booking, ...readArray<SavedPhoneBooking>(storage, PHONE_BOOKINGS_KEY)]);
  appendAuditLog(storage, {
    action: 'phoneBooking.created',
    summary: `${booking.name}さんの電話予約を登録しました。`,
    details: {
      bookingId: booking.id,
      date: booking.date,
      slot: booking.slotLabel,
      notification: booking.notification,
    },
  }, now, idFactory);

  if (email) {
    const notification: NotificationQueueItem = {
      id: idFactory(),
      bookingId: booking.id,
      recipientEmail: DEMO_PHONE_CONTACT.email,
      status: 'queued',
      createdAt: now.toISOString(),
    };
    writeArray(storage, NOTIFICATION_QUEUE_KEY, [notification, ...readArray<NotificationQueueItem>(storage, NOTIFICATION_QUEUE_KEY)]);
    appendAuditLog(storage, {
      action: 'notification.queued',
      summary: `${booking.name}さんへの予約通知を送信待ちに追加しました。`,
      details: { bookingId: booking.id, recipientEmail: DEMO_PHONE_CONTACT.email },
    }, now, idFactory);
  }

  return booking;
}

export function recordBulkCancellation(
  storage: StorageLike,
  input: Omit<BulkCancellationRecord, 'id' | 'createdAt'>,
  now = new Date(),
  idFactory: IdFactory = makeId,
): BulkCancellationRecord {
  if (input.affectedBookings < 1 || input.affectedUsers < 1) throw new Error('中止対象の予約数と利用者数を確認してください。');
  const record: BulkCancellationRecord = {
    ...input,
    reason: input.reason.trim() || '農園都合による開催中止',
    id: idFactory(),
    createdAt: now.toISOString(),
  };
  const phoneBookings = readArray<SavedPhoneBooking>(storage, PHONE_BOOKINGS_KEY).map((booking) => (
    booking.date === record.date ? { ...booking, status: 'slotCanceled' as const } : booking
  ));
  writeArray(storage, PHONE_BOOKINGS_KEY, phoneBookings);
  writeArray(storage, BULK_CANCELLATIONS_KEY, [record, ...readArray<BulkCancellationRecord>(storage, BULK_CANCELLATIONS_KEY)]);
  appendAuditLog(storage, {
    action: 'bulkCancellation.completed',
    summary: `${record.affectedBookings}件・${record.affectedUsers}名を対象に一括中止しました。`,
    details: {
      cancellationId: record.id,
      date: record.date,
      affectedBookings: record.affectedBookings,
      affectedUsers: record.affectedUsers,
      reason: record.reason,
    },
  }, now, idFactory);
  return record;
}

export function readAdminAuditLogs(storage: StorageLike): AdminAuditLog[] {
  return readArray<AdminAuditLog>(storage, AUDIT_LOGS_KEY);
}

export function resetAdminDemo(
  storage: StorageLike,
  now = new Date(),
  idFactory: IdFactory = makeId,
): AdminAuditLog {
  storage.removeItem(PHONE_BOOKINGS_KEY);
  storage.removeItem(NOTIFICATION_QUEUE_KEY);
  storage.removeItem(BULK_CANCELLATIONS_KEY);
  storage.removeItem(AUDIT_LOGS_KEY);
  return appendAuditLog(storage, {
    action: 'demo.reset',
    summary: '新管理画面のデモデータを初期状態へ戻しました。',
    details: { reset: true },
  }, now, idFactory);
}

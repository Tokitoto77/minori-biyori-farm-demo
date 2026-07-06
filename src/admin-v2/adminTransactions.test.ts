import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUDIT_LOGS_KEY,
  BULK_CANCELLATIONS_KEY,
  NOTIFICATION_QUEUE_KEY,
  PHONE_BOOKINGS_KEY,
  createPhoneBooking,
  readAdminAuditLogs,
  recordBulkCancellation,
  resetAdminDemo,
  type StorageLike,
} from './adminTransactions';

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function ids() {
  let value = 0;
  return () => `id-${++value}`;
}

const now = new Date('2030-08-01T09:00:00+09:00');

test('メールが空の電話予約は通知処理を自動で省略する', () => {
  const storage = new MemoryStorage();
  const booking = createPhoneBooking(storage, {
    date: '2030-08-01',
    slotId: 'slot-10',
    slotLabel: '10:00〜11:30',
    name: '山田 花子',
    phone: '090-1234-5678',
    email: '',
  }, now, ids());

  assert.equal(booking.notification, 'skipped');
  assert.equal(JSON.parse(storage.getItem(PHONE_BOOKINGS_KEY) ?? '[]').length, 1);
  assert.equal(storage.getItem(NOTIFICATION_QUEUE_KEY), null);
  assert.equal(readAdminAuditLogs(storage)[0]?.details.notification, 'skipped');
});

test('メールがある電話予約だけ通知待ちへ追加する', () => {
  const storage = new MemoryStorage();
  const booking = createPhoneBooking(storage, {
    date: '2030-08-01',
    slotId: 'slot-13',
    slotLabel: '13:00〜14:30',
    name: '佐藤 健',
    phone: '03-1234-5678',
    email: 'guest@example.com',
  }, now, ids());

  assert.equal(booking.notification, 'queued');
  assert.equal(booking.name, 'デモ利用者');
  assert.equal(booking.phone, '000-0000-0000');
  assert.equal(booking.email, 'demo@example.invalid');
  assert.equal((storage.getItem(PHONE_BOOKINGS_KEY) ?? '').includes('佐藤 健'), false);
  assert.equal((storage.getItem(PHONE_BOOKINGS_KEY) ?? '').includes('03-1234-5678'), false);
  assert.equal((storage.getItem(PHONE_BOOKINGS_KEY) ?? '').includes('guest@example.com'), false);
  assert.equal(JSON.parse(storage.getItem(NOTIFICATION_QUEUE_KEY) ?? '[]').length, 1);
  assert.deepEqual(readAdminAuditLogs(storage).map((log) => log.action), ['notification.queued', 'phoneBooking.created']);
});

test('電話予約は列挙した安全な項目だけを保存し、将来追加されたPIIを引き継がない', () => {
  const storage = new MemoryStorage();
  const draft = {
    date: '2030-08-01',
    slotId: 'slot-15',
    slotLabel: '15:00〜16:30',
    name: '実在 利用者',
    phone: '090-9999-8888',
    email: 'real-person@example.com',
    futureSensitiveField: '保存禁止の追加PII',
  };

  createPhoneBooking(storage, draft, now, ids());

  const serialized = storage.getItem(PHONE_BOOKINGS_KEY) ?? '';
  const [saved] = JSON.parse(serialized) as Array<Record<string, unknown>>;
  assert.deepEqual(Object.keys(saved).sort(), [
    'createdAt', 'date', 'email', 'id', 'name', 'notification', 'phone', 'slotId', 'slotLabel', 'source', 'status',
  ].sort());
  assert.equal(serialized.includes('実在 利用者'), false);
  assert.equal(serialized.includes('090-9999-8888'), false);
  assert.equal(serialized.includes('real-person@example.com'), false);
  assert.equal(serialized.includes('保存禁止の追加PII'), false);
});

test('一括中止は影響件数と利用者数を監査ログへ残す', () => {
  const storage = new MemoryStorage();
  const idFactory = ids();
  createPhoneBooking(storage, {
    date: '2030-08-01',
    slotId: 'slot-10',
    slotLabel: '10:00〜11:30',
    name: '田中 一郎',
    phone: '090-1111-2222',
  }, now, idFactory);
  recordBulkCancellation(storage, {
    date: '2030-08-01',
    affectedBookings: 8,
    affectedUsers: 24,
    reason: '荒天予報',
  }, now, idFactory);

  assert.equal(JSON.parse(storage.getItem(BULK_CANCELLATIONS_KEY) ?? '[]')[0].affectedUsers, 24);
  assert.equal(JSON.parse(storage.getItem(PHONE_BOOKINGS_KEY) ?? '[]')[0].status, 'slotCanceled');
  assert.equal(readAdminAuditLogs(storage)[0]?.details.affectedBookings, 8);
  assert.equal(readAdminAuditLogs(storage)[0]?.details.affectedUsers, 24);
});

test('デモリセットは取引データを消去しリセット操作だけを記録する', () => {
  const storage = new MemoryStorage();
  storage.setItem(PHONE_BOOKINGS_KEY, '[{"id":"booking"}]');
  storage.setItem(NOTIFICATION_QUEUE_KEY, '[{"id":"notification"}]');
  storage.setItem(BULK_CANCELLATIONS_KEY, '[{"id":"cancellation"}]');
  storage.setItem(AUDIT_LOGS_KEY, '[{"id":"old"}]');

  resetAdminDemo(storage, now, ids());

  assert.equal(storage.getItem(PHONE_BOOKINGS_KEY), null);
  assert.equal(storage.getItem(NOTIFICATION_QUEUE_KEY), null);
  assert.equal(storage.getItem(BULK_CANCELLATIONS_KEY), null);
  assert.deepEqual(readAdminAuditLogs(storage).map((log) => log.action), ['demo.reset']);
});

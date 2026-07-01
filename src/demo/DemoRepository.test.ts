import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { addDays, addHours, format, setHours, setMinutes } from 'date-fns';
import type { SlotCreateInput } from '../domain/types';
import { DemoRepository } from './DemoRepository';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  clear() { this.values.clear(); }
  dump() { return Array.from(this.values.values()).join('\n'); }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    localStorage: storage,
    dispatchEvent: () => true,
  },
});

beforeEach(() => storage.clear());

function slotInput(dayOffset: number, publicationStatus: SlotCreateInput['publicationStatus'] = 'published'): SlotCreateInput {
  const startAt = setMinutes(setHours(addDays(new Date(), dayOffset), 9), 30);
  return {
    experienceId: 'exp-strawberry',
    startAt: startAt.toISOString(),
    endAt: addHours(startAt, 1).toISOString(),
    capacity: 12,
    prices: { adult: 2000, child: 1200, infant: 0 },
    bookingOpenAt: addHours(new Date(), -1).toISOString(),
    bookingCloseAt: addHours(startAt, -2).toISOString(),
    cancellationDeadline: addHours(startAt, -3).toISOString(),
    fewThreshold: 3,
    publicationStatus,
    manualStatus: 'normal',
    note: 'テスト枠',
  };
}

test('予約入力の個人情報を固定ダミー値へ置換して保存する', async () => {
  const repository = new DemoRepository();
  const slots = await repository.listSlots();
  const booking = await repository.createBooking({
    slotId: slots[0].id,
    party: { adults: 1, children: 1, infants: 1 },
    contact: {
      name: '実在 花子',
      email: 'hanako@example.com',
      phone: '090-1234-5678',
      note: '個人を特定できる備考',
    },
  });

  assert.equal(booking.contact.name, 'デモ利用者');
  assert.equal(booking.contact.email, 'demo@example.invalid');
  assert.equal(booking.contact.phone, '000-0000-0000');
  assert.equal(booking.totalPeople, 3);
  assert.doesNotMatch(storage.dump(), /実在 花子|hanako@example\.com|090-1234-5678|個人を特定できる備考/);
});

test('予約番号とデモ用メールが一致した場合だけ照会できる', async () => {
  const repository = new DemoRepository();
  const found = await repository.lookupBooking('MB-DEMO-7K3P', 'demo@example.invalid');
  const missing = await repository.lookupBooking('MB-DEMO-7K3P', 'other@example.invalid');
  assert.equal(found?.code, 'MB-DEMO-7K3P');
  assert.equal(missing, null);
});

test('待機番号を開催枠ごとに重複なく採番する', async () => {
  const repository = new DemoRepository();
  const slots = await repository.listSlots();
  const fullSlot = slots.find((slot) => slot.displayStatus === 'full');
  assert.ok(fullSlot);
  const input = {
    slotId: fullSlot.id,
    party: { adults: 2, children: 0, infants: 0 },
    contact: { name: 'デモ', email: 'demo@example.invalid', phone: '000-0000-0000' },
  };
  const first = await repository.createWaitlist(input);
  const second = await repository.createWaitlist(input);
  assert.equal(first.queueNumber, 1);
  assert.equal(second.queueNumber, 2);
});

test('開催中止・停止・調整中・受付期間外の枠は直接呼び出しでも待機登録できない', async () => {
  const repository = new DemoRepository();
  const slots = await repository.listSlots();
  for (const status of ['cancelled', 'paused', 'adjusting', 'outside'] as const) {
    const slot = slots.find((item) => item.displayStatus === status);
    if (!slot) continue;
    await assert.rejects(repository.createWaitlist({
      slotId: slot.id,
      party: { adults: 1, children: 0, infants: 0 },
      contact: { name: 'デモ', email: 'demo@example.invalid', phone: '000-0000-0000' },
    }), /受け付けていません/);
  }
});

test('デモ初期化で操作後のデータを復元できる', async () => {
  const repository = new DemoRepository();
  const slots = await repository.listSlots();
  const fullSlot = slots.find((slot) => slot.displayStatus === 'full');
  assert.ok(fullSlot);
  await repository.createWaitlist({
    slotId: fullSlot.id,
    party: { adults: 1, children: 0, infants: 0 },
    contact: { name: 'デモ', email: 'demo@example.invalid', phone: '000-0000-0000' },
  });
  assert.equal((await repository.listWaitlistEntries()).length, 1);
  await repository.resetDemo();
  assert.equal((await repository.listWaitlistEntries()).length, 0);
});

test('下書き枠は利用者一覧と直接参照から隠し、予約・待機も拒否する', async () => {
  const repository = new DemoRepository();
  const draft = await repository.createSlot(slotInput(90, 'draft'));
  const month = format(new Date(draft.startAt), 'yyyy-MM');
  assert.equal((await repository.listCalendar(month)).some((slot) => slot.id === draft.id), false);
  assert.equal(await repository.getSlot(draft.id), null);
  const input = {
    slotId: draft.id,
    party: { adults: 1, children: 0, infants: 0 },
    contact: { name: 'デモ', email: 'demo@example.invalid', phone: '000-0000-0000' },
  };
  await assert.rejects(repository.createBooking(input), /まだ公開されていません/);
  await assert.rejects(repository.createWaitlist(input), /まだ公開されていません/);
});

test('利用者向け体験一覧は3プランを返し、次回枠は公開済みだけを対象にする', async () => {
  const repository = new DemoRepository();
  assert.deepEqual((await repository.listExperiences()).map((experience) => experience.id), [
    'exp-strawberry',
    'exp-blueberry',
    'exp-herb',
  ]);

  const published = await repository.createSlot({ ...slotInput(110), experienceId: 'exp-blueberry' });
  await repository.createSlot({ ...slotInput(109, 'draft'), experienceId: 'exp-blueberry' });
  const next = await repository.findNextPublishedSlot('exp-blueberry', addDays(new Date(), 105).toISOString());
  assert.equal(next?.id, published.id);
  assert.equal(await repository.findNextPublishedSlot('exp-missing', new Date().toISOString()), null);
});

test('重複を含む一括作成は1件も保存しない', async () => {
  const repository = new DemoRepository();
  const before = (await repository.listSlots()).length;
  const duplicate = slotInput(91);
  await assert.rejects(repository.createSlots([duplicate, { ...duplicate, note: '重複' }]), /すでにあります/);
  assert.equal((await repository.listSlots()).length, before);
});

test('不正な料金を含む一括作成も全件保存しない', async () => {
  const repository = new DemoRepository();
  const before = (await repository.listSlots()).length;
  await assert.rejects(repository.createSlots([
    slotInput(95),
    { ...slotInput(96), prices: { adult: -1, child: 1200, infant: 0 } },
  ]), /料金は0以上/);
  assert.equal((await repository.listSlots()).length, before);
});

test('下書きを公開すると利用者カレンダーへ即時反映される', async () => {
  const repository = new DemoRepository();
  const draft = await repository.createSlot(slotInput(97, 'draft'));
  const month = format(new Date(draft.startAt), 'yyyy-MM');
  assert.equal((await repository.listCalendar(month)).some((slot) => slot.id === draft.id), false);
  await repository.updateSlot(draft.id, { publicationStatus: 'published' });
  assert.equal((await repository.listCalendar(month)).some((slot) => slot.id === draft.id), true);
});

test('予約・待機履歴がある枠は日時変更と削除を拒否する', async () => {
  const repository = new DemoRepository();
  const slot = await repository.createSlot({ ...slotInput(92), capacity: 1, fewThreshold: 1 });
  await repository.createWaitlist({
    slotId: slot.id,
    party: { adults: 2, children: 0, infants: 0 },
    contact: { name: 'デモ', email: 'demo@example.invalid', phone: '000-0000-0000' },
  });
  await assert.rejects(repository.updateSlot(slot.id, { startAt: addHours(new Date(slot.startAt), 1).toISOString() }), /変更できません/);
  await assert.rejects(repository.deleteSlot(slot.id), /開催中止/);
});

test('履歴のない枠は削除でき、確定人数未満への定員変更は拒否する', async () => {
  const repository = new DemoRepository();
  const removable = await repository.createSlot(slotInput(93));
  await repository.deleteSlot(removable.id);
  assert.equal((await repository.listSlots()).some((slot) => slot.id === removable.id), false);

  const bookedSlot = await repository.createSlot(slotInput(94));
  await repository.createBooking({
    slotId: bookedSlot.id,
    party: { adults: 2, children: 0, infants: 0 },
    contact: { name: 'デモ', email: 'demo@example.invalid', phone: '000-0000-0000' },
  });
  await assert.rejects(repository.updateSlot(bookedSlot.id, { capacity: 1 }), /確定予約人数/);
  const updated = await repository.updateSlot(bookedSlot.id, { prices: { adult: 2100, child: 1300, infant: 0 }, note: '履歴後の運用変更' });
  assert.equal(updated.prices.adult, 2100);
  assert.equal(updated.note, '履歴後の運用変更');
});

test('予約は確定から利用者キャンセルへ一度だけ遷移し、期限切れを拒否する', async () => {
  const repository = new DemoRepository();
  const cancellableSlot = await repository.createSlot(slotInput(98));
  const booking = await repository.createBooking({
    slotId: cancellableSlot.id,
    party: { adults: 1, children: 0, infants: 0 },
    contact: { name: 'デモ', email: 'demo@example.invalid', phone: '000-0000-0000' },
  });
  const canceled = await repository.cancelBooking(booking.code, 'demo@example.invalid');
  assert.equal(canceled?.status, 'canceledByGuest');
  assert.equal(await repository.cancelBooking(booking.code, 'demo@example.invalid'), null);

  const expiredSlot = await repository.createSlot(slotInput(99));
  const expiredBooking = await repository.createBooking({
    slotId: expiredSlot.id,
    party: { adults: 1, children: 0, infants: 0 },
    contact: { name: 'デモ', email: 'demo@example.invalid', phone: '000-0000-0000' },
  });
  await repository.updateSlot(expiredSlot.id, { cancellationDeadline: addHours(new Date(), -1).toISOString() });
  await assert.rejects(repository.cancelBooking(expiredBooking.code, 'demo@example.invalid'), /期限を過ぎています/);
});

test('待機は待機中から予約へ一度だけ繰り上がる', async () => {
  const repository = new DemoRepository();
  const slot = await repository.createSlot({ ...slotInput(100), capacity: 1, fewThreshold: 1 });
  await repository.createBooking({
    slotId: slot.id,
    party: { adults: 1, children: 0, infants: 0 },
    contact: { name: 'デモ', email: 'demo@example.invalid', phone: '000-0000-0000' },
  });
  const waiting = await repository.createWaitlist({
    slotId: slot.id,
    party: { adults: 1, children: 0, infants: 0 },
    contact: { name: 'デモ', email: 'demo@example.invalid', phone: '000-0000-0000' },
  });
  await repository.updateSlot(slot.id, { capacity: 2 });
  const promoted = await repository.promoteWaitlist(waiting.id);
  assert.equal(promoted.source, 'waitlist');
  assert.equal((await repository.listWaitlistEntries()).find((entry) => entry.id === waiting.id)?.status, 'promoted');
  await assert.rejects(repository.promoteWaitlist(waiting.id), /繰り上げ可能/);
});

test('開催中止は確定予約と待機を終端状態へ遷移させ、その後の申込を拒否する', async () => {
  const repository = new DemoRepository();
  const slot = await repository.createSlot({ ...slotInput(101), capacity: 1, fewThreshold: 1 });
  await repository.createBooking({
    slotId: slot.id,
    party: { adults: 1, children: 0, infants: 0 },
    contact: { name: 'デモ', email: 'demo@example.invalid', phone: '000-0000-0000' },
  });
  await repository.createWaitlist({
    slotId: slot.id,
    party: { adults: 1, children: 0, infants: 0 },
    contact: { name: 'デモ', email: 'demo@example.invalid', phone: '000-0000-0000' },
  });
  const canceledSlot = await repository.cancelSlot(slot.id, '荒天のため中止');
  assert.equal(canceledSlot.manualStatus, 'cancelled');
  assert.equal((await repository.listBookings(slot.id))[0].status, 'slotCanceled');
  assert.equal((await repository.listWaitlistEntries(slot.id))[0].status, 'slotCanceled');
  const input = { slotId: slot.id, party: { adults: 1, children: 0, infants: 0 }, contact: { name: 'デモ', email: 'demo@example.invalid', phone: '000-0000-0000' } };
  await assert.rejects(repository.createBooking(input), /残席状況が変わりました/);
  await assert.rejects(repository.createWaitlist(input), /受け付けていません/);
});

test('開催中止は専用操作だけを許可し、中止後は受付状態を変更できない', async () => {
  const repository = new DemoRepository();
  const slot = await repository.createSlot(slotInput(102));

  await assert.rejects(
    repository.updateSlot(slot.id, { manualStatus: 'cancelled' }),
    /専用の開催中止操作/,
  );

  await repository.cancelSlot(slot.id, '状態遷移テスト');
  for (const manualStatus of ['normal', 'paused', 'adjusting'] as const) {
    await assert.rejects(
      repository.updateSlot(slot.id, { manualStatus }),
      /開催中止済み/,
    );
  }
  await assert.rejects(repository.cancelSlot(slot.id, '二重送信'), /すでに開催中止/);
});

test('通知は失敗から送信済みへだけ再送でき、二重再送を拒否する', async () => {
  const repository = new DemoRepository();
  const failed = (await repository.listNotificationJobs('failed'))[0];
  assert.ok(failed);
  const sent = await repository.retryNotification(failed.id);
  assert.equal(sent.status, 'sent');
  assert.equal(sent.attempts, 2);
  await assert.rejects(repository.retryNotification(failed.id), /送信失敗の通知だけ/);
});

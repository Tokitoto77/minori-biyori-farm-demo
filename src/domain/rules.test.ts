import assert from 'node:assert/strict';
import test from 'node:test';
import { addHours } from 'date-fns';
import { assertParty, buildWeeklyDates, calculatePrice, canBookSlot, canDeleteSlot, canJoinWaitlist, getSlotCallToAction, isContactNameCandidate, isEmailCandidate, isPhoneCandidate, partyTotal, resolveDisplayStatus } from './rules';
import type { Booking, CalendarSlot, DisplaySlotStatus, Slot, WaitlistEntry } from './types';

function slot(overrides: Partial<Slot> = {}): Slot {
  const now = new Date();
  return {
    id: 'slot-test',
    experienceId: 'exp-test',
    startAt: addHours(now, 4).toISOString(),
    endAt: addHours(now, 5).toISOString(),
    capacity: 10,
    prices: { adult: 2200, child: 1400, infant: 0 },
    bookingOpenAt: addHours(now, -2).toISOString(),
    bookingCloseAt: addHours(now, 2).toISOString(),
    cancellationDeadline: addHours(now, 1).toISOString(),
    fewThreshold: 3,
    publicationStatus: 'published',
    manualStatus: 'normal',
    note: '',
    waitlistSeq: 0,
    ...overrides,
  };
}

function calendarSlot(overrides: Partial<CalendarSlot> = {}): CalendarSlot {
  return {
    ...slot(),
    experience: {
      id: 'exp-test', slug: 'test', name: 'テスト体験', eyebrow: '', summary: '', description: '', durationMinutes: 60,
      clothing: '', belongings: '', rainPolicy: '', accent: '#000000', image: '',
    },
    bookedPeople: 0,
    remaining: 10,
    displayStatus: 'available',
    ...overrides,
  };
}

test('大人・子ども・幼児をすべて定員人数へ含める', () => {
  assert.equal(partyTotal({ adults: 2, children: 3, infants: 1 }), 6);
});

test('年齢別料金を正しく合計する', () => {
  assert.equal(calculatePrice({ adults: 2, children: 1, infants: 2 }, { adult: 2200, child: 1400, infant: 0 }), 5800);
});

test('1グループ最大10名を超える入力を拒否する', () => {
  assert.doesNotThrow(() => assertParty({ adults: 6, children: 3, infants: 1 }));
  assert.throws(() => assertParty({ adults: 7, children: 3, infants: 1 }), /11人以上/);
});

test('表示状態は開催中止、生育調整中、受付停止を残席より優先する', () => {
  assert.equal(resolveDisplayStatus(slot({ manualStatus: 'cancelled' }), 0), 'cancelled');
  assert.equal(resolveDisplayStatus(slot({ manualStatus: 'adjusting' }), 10), 'adjusting');
  assert.equal(resolveDisplayStatus(slot({ manualStatus: 'paused' }), 0), 'paused');
});

test('残席0は満員、閾値以下は残りわずか、それ以外は受付中になる', () => {
  assert.equal(resolveDisplayStatus(slot(), 10), 'full');
  assert.equal(resolveDisplayStatus(slot(), 7), 'few');
  assert.equal(resolveDisplayStatus(slot(), 6), 'available');
});

test('毎週作成は終了日を含めて同じ曜日を生成し、12枠を超える場合は拒否する', () => {
  const dates = buildWeeklyDates(new Date('2030-07-03T09:30:00'), new Date('2030-07-17T09:30:00'));
  assert.deepEqual(dates.map((date) => date.getDate()), [3, 10, 17]);
  assert.throws(() => buildWeeklyDates(new Date('2030-01-01T09:30:00'), new Date('2030-05-01T09:30:00')), /最大12枠/);
});

test('予約可否の決定表を全主要状態で固定する', () => {
  const cases: { publicationStatus: Slot['publicationStatus']; status: DisplaySlotStatus; remaining: number; people: number; expected: boolean }[] = [
    { publicationStatus: 'published', status: 'available', remaining: 3, people: 2, expected: true },
    { publicationStatus: 'published', status: 'few', remaining: 2, people: 2, expected: true },
    { publicationStatus: 'published', status: 'few', remaining: 1, people: 2, expected: false },
    { publicationStatus: 'published', status: 'full', remaining: 0, people: 1, expected: false },
    { publicationStatus: 'published', status: 'outside', remaining: 10, people: 1, expected: false },
    { publicationStatus: 'published', status: 'paused', remaining: 10, people: 1, expected: false },
    { publicationStatus: 'published', status: 'cancelled', remaining: 10, people: 1, expected: false },
    { publicationStatus: 'draft', status: 'available', remaining: 10, people: 1, expected: false },
  ];
  for (const item of cases) {
    assert.equal(canBookSlot(calendarSlot({ publicationStatus: item.publicationStatus, displayStatus: item.status, remaining: item.remaining }), { adults: item.people, children: 0, infants: 0 }), item.expected, JSON.stringify(item));
  }
});

test('キャンセル待ち可否の決定表を全主要状態で固定する', () => {
  const cases: { publicationStatus: Slot['publicationStatus']; status: DisplaySlotStatus; remaining: number; people: number; expected: boolean }[] = [
    { publicationStatus: 'published', status: 'full', remaining: 0, people: 1, expected: true },
    { publicationStatus: 'published', status: 'few', remaining: 1, people: 2, expected: true },
    { publicationStatus: 'published', status: 'available', remaining: 2, people: 2, expected: false },
    { publicationStatus: 'published', status: 'outside', remaining: 0, people: 1, expected: false },
    { publicationStatus: 'published', status: 'adjusting', remaining: 0, people: 1, expected: false },
    { publicationStatus: 'published', status: 'paused', remaining: 0, people: 1, expected: false },
    { publicationStatus: 'published', status: 'cancelled', remaining: 0, people: 1, expected: false },
    { publicationStatus: 'draft', status: 'full', remaining: 0, people: 1, expected: false },
  ];
  for (const item of cases) {
    assert.equal(canJoinWaitlist(calendarSlot({ publicationStatus: item.publicationStatus, displayStatus: item.status, remaining: item.remaining }), { adults: item.people, children: 0, infants: 0 }), item.expected, JSON.stringify(item));
  }
});

test('開催枠一覧のCTAは受付状態と矛盾しない', () => {
  const now = new Date('2030-07-01T09:00:00+09:00');
  const cases: { status: DisplaySlotStatus; bookingOpenAt?: string; bookingCloseAt?: string; kind: 'booking' | 'waitlist' | 'unavailable'; label: string }[] = [
    { status: 'available', kind: 'booking', label: '予約へ進む' },
    { status: 'few', kind: 'booking', label: '予約へ進む' },
    { status: 'full', kind: 'waitlist', label: 'キャンセル待ちへ' },
    { status: 'adjusting', kind: 'unavailable', label: '生育調整中' },
    { status: 'paused', kind: 'unavailable', label: '受付停止中' },
    { status: 'cancelled', kind: 'unavailable', label: '開催中止' },
    { status: 'outside', bookingOpenAt: '2030-07-02T09:00:00+09:00', bookingCloseAt: '2030-07-03T09:00:00+09:00', kind: 'unavailable', label: '受付開始前' },
    { status: 'outside', bookingOpenAt: '2030-06-29T09:00:00+09:00', bookingCloseAt: '2030-06-30T09:00:00+09:00', kind: 'unavailable', label: '受付終了' },
  ];
  for (const item of cases) {
    const action = getSlotCallToAction(calendarSlot({ displayStatus: item.status, bookingOpenAt: item.bookingOpenAt, bookingCloseAt: item.bookingCloseAt }), now);
    assert.deepEqual({ kind: action.kind, label: action.label }, { kind: item.kind, label: item.label }, JSON.stringify(item));
  }
});

test('削除条件は「予約も待機もない」かつDe Morgan変換と同値になる', () => {
  const booking = { slotId: 'slot-test' } as Booking;
  const waitlist = { slotId: 'slot-test' } as WaitlistEntry;
  const cases = [
    { hasBooking: false, hasWaitlist: false, expected: true },
    { hasBooking: true, hasWaitlist: false, expected: false },
    { hasBooking: false, hasWaitlist: true, expected: false },
    { hasBooking: true, hasWaitlist: true, expected: false },
  ];
  for (const item of cases) {
    const neither = !item.hasBooking && !item.hasWaitlist;
    const negatedUnion = !(item.hasBooking || item.hasWaitlist);
    assert.equal(neither, negatedUnion);
    assert.equal(canDeleteSlot(item.hasBooking ? [booking] : [], item.hasWaitlist ? [waitlist] : [], 'slot-test'), item.expected);
    if (item.hasBooking !== item.hasWaitlist) assert.notEqual(neither, !item.hasBooking || !item.hasWaitlist);
  }
});

test('連絡先の正規表現は候補形式と長さだけを判定する', () => {
  const emailCases = [
    ['demo@example.invalid', true], ['', false], ['a@b', false], [`${'a'.repeat(250)}@example.com`, false], ['a b@example.com', false],
  ] as const;
  const phoneCases = [
    ['090-1234-5678', true], ['+81 (0)90 1234 5678', true], ['', false], ['1234567', false], ['090-ABCD-5678', false], ['1'.repeat(33), false],
  ] as const;
  for (const [value, expected] of emailCases) assert.equal(isEmailCandidate(value), expected, value.slice(0, 30));
  for (const [value, expected] of phoneCases) assert.equal(isPhoneCandidate(value), expected, value.slice(0, 30));
  assert.equal(isContactNameCandidate('デモ 太郎'), true);
  assert.equal(isContactNameCandidate(''), false);
  assert.equal(isContactNameCandidate('あ'.repeat(101)), false);
  assert.equal(isEmailCandidate(`${'a'.repeat(100_000)}!`), false);
  assert.equal(isPhoneCandidate(`${'1'.repeat(100_000)}!`), false);
});

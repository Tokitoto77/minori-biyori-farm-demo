import { addDays, addHours, addMinutes, addMonths, endOfMonth, format, setHours, setMinutes, startOfMonth } from 'date-fns';
import type { Booking, DemoState, Experience, ManualSlotStatus, Slot } from '../domain/types';

export const DEMO_STATE_VERSION = 4;

export const experiences: Experience[] = [
  {
    id: 'exp-strawberry',
    slug: 'strawberry',
    name: 'いちご狩り体験',
    eyebrow: '春から初夏のごほうび',
    summary: '畑でいちばん甘い一粒を、ご家族で見つける朝。',
    description: '完熟した実だけを見分けながら、ゆっくり摘み取ります。小さなお子さま用の低い畝もご用意しています。',
    durationMinutes: 90,
    clothing: '汚れてもよい服、歩きやすい靴',
    belongings: '帽子、飲み物、持ち帰り用の保冷バッグ',
    rainPolicy: '小雨決行。荒天時は開催2時間前までにご案内します。',
    accent: '#b63f3f',
    image: '/images/strawberry-field.jpg',
  },
  {
    id: 'exp-blueberry',
    slug: 'blueberry',
    name: 'ブルーベリー狩り体験',
    eyebrow: '木陰で味わう夏時間',
    summary: '食べ比べながら、お気に入りの品種を探す体験。',
    description: '農園スタッフが熟した実の見つけ方をご案内します。ベビーカーでも通れる区画があります。',
    durationMinutes: 90,
    clothing: '薄手の長袖、歩きやすい靴',
    belongings: '帽子、飲み物、虫よけ',
    rainPolicy: '雨天中止。中止の場合は開催前日18時までにご案内します。',
    accent: '#445f87',
    image: '/images/blueberry-basket.jpg',
  },
  {
    id: 'exp-herb',
    slug: 'herb',
    name: 'ハーブ摘み体験',
    eyebrow: '暮らしへ持ち帰る畑の香り',
    summary: '季節のハーブを摘み、小さなブーケを束ねます。',
    description: '香りを確かめながら収穫し、使い方もご紹介します。落ち着いた少人数制の体験です。',
    durationMinutes: 60,
    clothing: '長袖、歩きやすい靴',
    belongings: '帽子、飲み物',
    rainPolicy: '屋根付き区画で開催します。荒天時のみ中止します。',
    accent: '#58745a',
    image: '/images/herb-garden.jpg',
  },
];

function atTime(date: Date, hour: number, minute = 0): Date {
  return setMinutes(setHours(date, hour), minute);
}

function makeSlot(date: Date, hour: number, experienceId: string, index: number, status: ManualSlotStatus = 'normal', minute = 0): Slot {
  const start = atTime(date, hour, minute);
  const capacity = experienceId === 'exp-herb' ? 8 : 12;
  const durationMinutes = experiences.find((experience) => experience.id === experienceId)?.durationMinutes ?? 60;
  return {
    id: `slot-${format(date, 'yyyyMMdd')}-${hour}-${index}`,
    experienceId,
    startAt: start.toISOString(),
    endAt: addMinutes(start, durationMinutes).toISOString(),
    capacity,
    prices: { adult: experienceId === 'exp-herb' ? 1500 : 2000, child: experienceId === 'exp-herb' ? 800 : 1200, infant: 0 },
    bookingOpenAt: addDays(start, -45).toISOString(),
    bookingCloseAt: addHours(start, -2).toISOString(),
    cancellationDeadline: addHours(start, -3).toISOString(),
    fewThreshold: 3,
    publicationStatus: 'published',
    manualStatus: status,
    statusReason: status === 'adjusting' ? '実り具合を確認しています。明日正午に受付状況を更新します。' : undefined,
    note: '収穫量により、当日の品種が変わる場合があります。',
    waitlistSeq: 0,
  };
}

export function createInitialState(now = new Date()): DemoState {
  const monthStart = startOfMonth(addMonths(now, 1));
  const monthEnd = endOfMonth(addMonths(monthStart, 1));
  const slots: Slot[] = [];
  let cursor = monthStart;
  let index = 0;

  while (cursor <= monthEnd && slots.length < 55) {
    const dayOfMonth = Number(format(cursor, 'd'));
    if (dayOfMonth === 16) {
      slots.push(makeSlot(cursor, 9, 'exp-strawberry', 160, 'normal', 30));
      slots.push(makeSlot(cursor, 13, 'exp-blueberry', 161, 'normal', 30));
      slots.push(makeSlot(cursor, 15, 'exp-herb', 162, 'normal', 30));
      index += 1;
      cursor = addDays(cursor, 1);
      continue;
    }
    const experienceId = index % 3 === 0 ? 'exp-strawberry' : index % 3 === 1 ? 'exp-blueberry' : 'exp-herb';
    const status: ManualSlotStatus = dayOfMonth % 13 === 0 ? 'cancelled' : dayOfMonth % 11 === 0 ? 'paused' : dayOfMonth % 7 === 0 ? 'adjusting' : 'normal';
    slots.push(makeSlot(cursor, 10, experienceId, index, status));
    if (cursor.getDay() === 6 && slots.length < 55) {
      const secondExperience = index % 2 === 0 ? 'exp-blueberry' : 'exp-herb';
      slots.push(makeSlot(cursor, 13, secondExperience, index + 100, status));
    }
    index += 1;
    cursor = addDays(cursor, 1);
  }

  const seededBookings: Booking[] = [];
  function addSeededPeople(slot: Slot, total: number, label: string, lookupCode?: string) {
    let remaining = total;
    let group = 0;
    while (remaining > 0) {
      const people = Math.min(10, remaining);
      seededBookings.push({
        id: `booking-seed-${label}-${group}`,
        code: lookupCode && group === 0 ? lookupCode : `MB-DEMO-${label.toUpperCase()}${group}`,
        slotId: slot.id,
        contact: { name: 'デモ利用者', email: 'demo@example.invalid', phone: '000-0000-0000' },
        party: { adults: people, children: 0, infants: 0 },
        totalPeople: people,
        prices: slot.prices,
        totalPrice: people * slot.prices.adult,
        status: 'confirmed',
        source: 'web',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
      remaining -= people;
      group += 1;
    }
  }

  slots.forEach((slot, slotIndex) => {
    if (slot.manualStatus !== 'normal') return;
    const featuredLabel = `featured-${format(new Date(slot.startAt), 'MMdd')}`;
    if (slot.id.endsWith('-160')) addSeededPeople(slot, 4, `${featuredLabel}-strawberry`);
    else if (slot.id.endsWith('-161')) addSeededPeople(slot, 10, `${featuredLabel}-blueberry`);
    else if (slot.id.endsWith('-162')) addSeededPeople(slot, 8, `${featuredLabel}-herb`);
    else if (slotIndex === 0) addSeededPeople(slot, 3, 'lookup', 'MB-DEMO-7K3P');
    else if (slotIndex % 9 === 2) addSeededPeople(slot, slot.capacity, `full${slotIndex}`);
    else if (slotIndex % 5 === 1) addSeededPeople(slot, Math.max(1, slot.capacity - 2), `few${slotIndex}`);
  });

  return {
    version: DEMO_STATE_VERSION,
    farmName: 'みのり日和ファーム',
    experiences,
    slots,
    bookings: seededBookings,
    waitlistEntries: [],
    notificationJobs: [{
      id: 'notification-seed-failed',
      type: 'bookingAccepted',
      targetId: 'booking-seed-1',
      recipientName: 'デモ利用者',
      recipientEmail: 'demo@example.invalid',
      subject: 'ご予約を受け付けました',
      preview: 'デモ用に用意した通知失敗サンプルです。管理画面から再送できます。',
      status: 'failed',
      attempts: 1,
      createdAt: now.toISOString(),
    }],
    auditLogs: [{
      id: 'audit-seed',
      actor: 'system',
      action: 'DEMO_INITIALIZED',
      targetType: 'demo',
      targetId: 'demo',
      summary: '現在月に合わせてデモデータを用意しました。',
      createdAt: now.toISOString(),
    }],
  };
}

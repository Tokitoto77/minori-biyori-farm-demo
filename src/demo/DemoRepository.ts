import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { assertParty, assertSlotInput, calculatePrice, canBookSlot, canDeleteSlot, canJoinWaitlist, confirmedPeople, hasSlotHistory, partyTotal, toCalendarSlot } from '../domain/rules';
import type {
  AuditLog,
  Booking,
  BookingInput,
  CalendarSlot,
  Contact,
  DemoState,
  NotificationJob,
  PhoneBookingInput,
  Slot,
  SlotCreateInput,
  SlotUpdateInput,
  WaitlistEntry,
} from '../domain/types';
import type { AdminRepository, BookingRepository, PublicRepository } from '../repositories/contracts';
import { DemoNotificationProvider } from './DemoNotificationProvider';
import { readDemoState, resetDemoState, writeDemoState } from './storage';

const DEMO_CONTACT: Contact = {
  name: 'デモ利用者',
  email: 'demo@example.invalid',
  phone: '000-0000-0000',
};

function randomCode(prefix: 'MB' | 'WAIT' = 'MB'): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (byte) => (byte % 36).toString(36)).join('').toUpperCase();
  return `${prefix}-DEMO-${token}`;
}

function phoneBookingContact(contact: Contact): Contact {
  const normalized = {
    name: contact.name.trim(),
    phone: contact.phone.trim(),
    email: contact.email.trim().toLowerCase(),
    note: contact.note?.trim(),
  };
  if (!normalized.name || !normalized.phone) throw new Error('代表者名と電話番号を入力してください。');
  if (normalized.name.length > 40 || normalized.phone.length > 24 || normalized.email.length > 120 || (normalized.note?.length ?? 0) > 200) {
    throw new Error('代表者情報の文字数が上限を超えています。');
  }
  if (normalized.email && (!normalized.email.includes('@') || normalized.email.startsWith('@') || normalized.email.endsWith('@'))) {
    throw new Error('メールアドレスの形式を確認してください。');
  }
  return {
    ...DEMO_CONTACT,
    note: normalized.note ? 'デモ入力のため保存していません' : '',
  };
}

export class DemoRepository implements PublicRepository, BookingRepository, AdminRepository {
  private notifications = new DemoNotificationProvider();

  private calendarize(state: DemoState, slot: Slot): CalendarSlot {
    const experience = state.experiences.find((item) => item.id === slot.experienceId);
    if (!experience) throw new Error('体験情報が見つかりません。');
    return toCalendarSlot(slot, state.bookings, experience);
  }

  private addAudit(state: DemoState, log: Omit<AuditLog, 'id' | 'createdAt'>): void {
    state.auditLogs.unshift({
      ...log,
      id: `audit-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
    });
  }

  private addNotification(state: DemoState, type: NotificationJob['type'], targetId: string, slot: CalendarSlot, context: Record<string, string> = {}): void {
    const notification = this.notifications.createPreview(type, targetId, {
      experience: slot.experience.name,
      date: format(new Date(slot.startAt), 'M月d日(E) H:mm', { locale: ja }),
      ...context,
    });
    state.notificationJobs.unshift(notification);
  }

  async listCalendar(month: string): Promise<CalendarSlot[]> {
    const state = readDemoState();
    return state.slots
      .filter((slot) => slot.publicationStatus === 'published' && format(new Date(slot.startAt), 'yyyy-MM') === month)
      .map((slot) => this.calendarize(state, slot))
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
  }

  async findNextPublishedSlot(experienceId: string, from: string): Promise<CalendarSlot | null> {
    const state = readDemoState();
    const slot = state.slots
      .filter((item) => item.publicationStatus === 'published' && item.experienceId === experienceId && item.startAt >= from)
      .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
    return slot ? this.calendarize(state, slot) : null;
  }

  async getSlot(slotId: string): Promise<CalendarSlot | null> {
    const state = readDemoState();
    const slot = state.slots.find((item) => item.id === slotId && item.publicationStatus === 'published');
    return slot ? this.calendarize(state, slot) : null;
  }

  private createBookingRecord(state: DemoState, input: BookingInput, source: Booking['source']): Booking {
    assertParty(input.party);
    const rawSlot = state.slots.find((item) => item.id === input.slotId);
    if (!rawSlot) throw new Error('開催枠が見つかりません。');
    if (rawSlot.publicationStatus !== 'published') throw new Error('この開催枠はまだ公開されていません。');
    const slot = this.calendarize(state, rawSlot);
    if (!canBookSlot(slot, input.party)) {
      throw new Error('選択中に残席状況が変わりました。キャンセル待ちをご利用ください。');
    }

    const now = new Date().toISOString();
    const booking: Booking = {
      id: `booking-${crypto.randomUUID()}`,
      code: randomCode(),
      slotId: input.slotId,
      contact: source === 'phone' ? phoneBookingContact(input.contact) : { ...DEMO_CONTACT, note: input.contact.note ? 'デモ入力のため保存していません' : '' },
      party: { ...input.party },
      totalPeople: partyTotal(input.party),
      prices: { ...rawSlot.prices },
      totalPrice: calculatePrice(input.party, rawSlot.prices),
      status: 'confirmed',
      source,
      createdAt: now,
      updatedAt: now,
    };
    state.bookings.unshift(booking);
    this.addNotification(state, 'bookingAccepted', booking.id, slot);
    this.addAudit(state, {
      actor: source === 'phone' ? 'demoAdmin' : 'guest',
      action: source === 'phone' ? 'PHONE_BOOKING_CREATED' : 'BOOKING_CREATED',
      targetType: 'booking',
      targetId: booking.id,
      summary: `${slot.experience.name}を${booking.totalPeople}名で受け付けました。`,
    });
    return booking;
  }

  async createBooking(input: BookingInput): Promise<Booking> {
    const state = readDemoState();
    const booking = this.createBookingRecord(state, input, 'web');
    writeDemoState(state);
    return booking;
  }

  async lookupBooking(code: string, email: string): Promise<Booking | null> {
    const normalizedCode = code.trim().toUpperCase();
    const normalizedEmail = email.trim().toLowerCase();
    return readDemoState().bookings.find((booking) => booking.code.toUpperCase() === normalizedCode && booking.contact.email.toLowerCase() === normalizedEmail) ?? null;
  }

  async cancelBooking(code: string, email: string): Promise<Booking | null> {
    const state = readDemoState();
    const normalizedEmail = email.trim().toLowerCase();
    const booking = state.bookings.find((item) => item.code.toUpperCase() === code.trim().toUpperCase() && item.contact.email.toLowerCase() === normalizedEmail);
    if (!booking || booking.status !== 'confirmed') return null;
    const rawSlot = state.slots.find((item) => item.id === booking.slotId);
    if (!rawSlot) return null;
    if (new Date() > new Date(rawSlot.cancellationDeadline)) {
      throw new Error('Webキャンセル期限を過ぎています。農園へお電話ください。');
    }
    booking.status = 'canceledByGuest';
    booking.updatedAt = new Date().toISOString();
    const slot = this.calendarize(state, rawSlot);
    this.addNotification(state, 'guestCanceled', booking.id, slot);
    this.addAudit(state, {
      actor: 'guest',
      action: 'BOOKING_CANCELED',
      targetType: 'booking',
      targetId: booking.id,
      summary: `${booking.code}のキャンセルを受け付けました。`,
    });
    writeDemoState(state);
    return booking;
  }

  async createWaitlist(input: BookingInput): Promise<WaitlistEntry> {
    assertParty(input.party);
    const state = readDemoState();
    const rawSlot = state.slots.find((item) => item.id === input.slotId);
    if (!rawSlot) throw new Error('開催枠が見つかりません。');
    if (rawSlot.publicationStatus !== 'published') throw new Error('この開催枠はまだ公開されていません。');
    const slot = this.calendarize(state, rawSlot);
    if (!canJoinWaitlist(slot, input.party)) throw new Error('この開催枠は現在キャンセル待ちを受け付けていません。');
    rawSlot.waitlistSeq += 1;
    const now = new Date().toISOString();
    const entry: WaitlistEntry = {
      id: `waitlist-${crypto.randomUUID()}`,
      code: randomCode('WAIT'),
      slotId: rawSlot.id,
      contact: { ...DEMO_CONTACT },
      party: { ...input.party },
      totalPeople: partyTotal(input.party),
      queueNumber: rawSlot.waitlistSeq,
      status: 'waiting',
      createdAt: now,
      updatedAt: now,
    };
    state.waitlistEntries.push(entry);
    this.addAudit(state, {
      actor: 'guest',
      action: 'WAITLIST_CREATED',
      targetType: 'waitlist',
      targetId: entry.id,
      summary: `${entry.totalPeople}名のキャンセル待ちを受け付けました。`,
    });
    writeDemoState(state);
    return entry;
  }

  async getDashboard() {
    const state = readDemoState();
    const allSlots = state.slots.map((slot) => this.calendarize(state, slot)).sort((a, b) => a.startAt.localeCompare(b.startAt));
    const today = format(new Date(), 'yyyy-MM-dd');
    const todaySlots = allSlots.filter((slot) => format(new Date(slot.startAt), 'yyyy-MM-dd') === today);
    const upcomingSlots = allSlots.filter((slot) => new Date(slot.startAt) >= new Date()).slice(0, 10);
    const visible = todaySlots.length ? todaySlots : upcomingSlots.slice(0, 2);
    return {
      todaySlots: visible,
      upcomingSlots,
      confirmedPeople: visible.reduce((sum, slot) => sum + slot.bookedPeople, 0),
      remainingSeats: visible.reduce((sum, slot) => sum + slot.remaining, 0),
      waitingGroups: state.waitlistEntries.filter((entry) => entry.status === 'waiting').length,
      failedNotifications: state.notificationJobs.filter((job) => job.status === 'failed').length,
    };
  }

  async listSlots(range?: { from: string; to: string }): Promise<CalendarSlot[]> {
    const state = readDemoState();
    return state.slots
      .filter((slot) => !range || (slot.startAt >= range.from && slot.startAt <= range.to))
      .map((slot) => this.calendarize(state, slot))
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
  }

  async listExperiences() {
    return readDemoState().experiences;
  }

  async createSlot(input: SlotCreateInput): Promise<Slot> {
    return (await this.createSlots([input]))[0];
  }

  async createSlots(inputs: SlotCreateInput[]): Promise<Slot[]> {
    if (inputs.length < 1) throw new Error('作成する開催枠がありません。');
    if (inputs.length > 12) throw new Error('一度に作成できる開催枠は12件までです。');
    const state = readDemoState();
    const existingKeys = new Set(state.slots.map((slot) => `${slot.experienceId}|${slot.startAt}`));
    const batchKeys = new Set<string>();

    inputs.forEach((input) => {
      if (!state.experiences.some((experience) => experience.id === input.experienceId)) {
        throw new Error('選択した体験プランが見つかりません。');
      }
      assertSlotInput(input);
      const key = `${input.experienceId}|${input.startAt}`;
      if (existingKeys.has(key) || batchKeys.has(key)) {
        throw new Error('同じ体験・開始日時の開催枠がすでにあります。');
      }
      batchKeys.add(key);
    });

    const slots = inputs.map<Slot>((input) => ({
      ...input,
      prices: { ...input.prices },
      id: `slot-${crypto.randomUUID()}`,
      waitlistSeq: 0,
    }));
    state.slots.push(...slots);
    slots.forEach((slot) => {
      const experience = state.experiences.find((item) => item.id === slot.experienceId);
      const dateTime = format(new Date(slot.startAt), 'M/d H:mm', { locale: ja });
      this.addAudit(state, {
        actor: 'demoAdmin',
        action: 'SLOT_CREATED',
        targetType: 'slot',
        targetId: slot.id,
        summary: slot.publicationStatus === 'published'
          ? `${dateTime} ${experience?.name ?? '収穫体験'}を定員${slot.capacity}名で公開しました`
          : `${dateTime} ${experience?.name ?? '収穫体験'}を下書き保存しました`,
      });
    });
    writeDemoState(state);
    return slots;
  }

  async updateSlot(id: string, input: SlotUpdateInput): Promise<Slot> {
    const state = readDemoState();
    const slot = state.slots.find((item) => item.id === id);
    if (!slot) throw new Error('開催枠が見つかりません。');
    if (input.manualStatus === 'cancelled' && slot.manualStatus !== 'cancelled') {
      throw new Error('開催中止は専用の開催中止操作を使用してください。');
    }
    if (slot.manualStatus === 'cancelled' && input.manualStatus !== undefined && input.manualStatus !== 'cancelled') {
      throw new Error('開催中止済みの枠は受付状態を変更できません。');
    }
    const hasHistory = hasSlotHistory(state.bookings, state.waitlistEntries, id);
    if (hasHistory) {
      const lockedFields: (keyof SlotUpdateInput)[] = ['experienceId', 'startAt', 'endAt', 'publicationStatus'];
      const changedLockedField = lockedFields.find((field) => input[field] !== undefined && input[field] !== slot[field]);
      if (changedLockedField) {
        throw new Error('予約・待機履歴があるため、体験・日時・公開状態は変更できません。');
      }
    }

    const updated: Slot = { ...slot, ...input, prices: input.prices ? { ...input.prices } : slot.prices };
    if (!state.experiences.some((experience) => experience.id === updated.experienceId)) {
      throw new Error('選択した体験プランが見つかりません。');
    }
    const booked = confirmedPeople(state.bookings, id);
    if (updated.capacity < booked) throw new Error(`定員は確定予約人数（${booked}名）未満にできません。`);
    assertSlotInput(updated);
    if (state.slots.some((item) => item.id !== id && item.experienceId === updated.experienceId && item.startAt === updated.startAt)) {
      throw new Error('同じ体験・開始日時の開催枠がすでにあります。');
    }
    Object.assign(slot, updated);
    this.addAudit(state, {
      actor: 'demoAdmin',
      action: 'SLOT_UPDATED',
      targetType: 'slot',
      targetId: slot.id,
      summary: '開催枠の設定を変更しました。',
    });
    writeDemoState(state);
    return slot;
  }

  async setSlotPaused(id: string, paused: boolean): Promise<Slot> {
    const state = readDemoState();
    const slot = state.slots.find((item) => item.id === id);
    if (!slot) throw new Error('開催枠が見つかりません。');
    const experience = state.experiences.find((item) => item.id === slot.experienceId);
    if (!experience) throw new Error('体験情報が見つかりません。');
    if (slot.manualStatus === 'cancelled') throw new Error('開催中止済みの枠は受付状態を変更できません。');
    if (slot.manualStatus === 'adjusting') throw new Error('生育調整中の枠は、調整状態を解除してから受付状態を変更してください。');

    const nextStatus = paused ? 'paused' : 'normal';
    if (slot.manualStatus === nextStatus) {
      throw new Error(paused ? 'この開催枠はすでに受付停止中です。' : 'この開催枠はすでに通常受付中です。');
    }

    slot.manualStatus = nextStatus;
    slot.statusReason = paused ? '農園の判断で受付を一時停止しています。' : undefined;
    const dateTime = format(new Date(slot.startAt), 'M/d H:mm', { locale: ja });
    this.addAudit(state, {
      actor: 'demoAdmin',
      action: paused ? 'SLOT_PAUSED' : 'SLOT_RESUMED',
      targetType: 'slot',
      targetId: slot.id,
      summary: paused
        ? `${dateTime} ${experience.name}を受付停止にしました`
        : `${dateTime} ${experience.name}の受付を再開しました`,
    });
    writeDemoState(state);
    return slot;
  }

  async deleteSlot(id: string): Promise<void> {
    const state = readDemoState();
    const slotIndex = state.slots.findIndex((item) => item.id === id);
    if (slotIndex < 0) throw new Error('開催枠が見つかりません。');
    if (!canDeleteSlot(state.bookings, state.waitlistEntries, id)) throw new Error('予約・待機履歴があるため削除できません。開催中止をご利用ください。');
    state.slots.splice(slotIndex, 1);
    this.addAudit(state, {
      actor: 'demoAdmin',
      action: 'SLOT_DELETED',
      targetType: 'slot',
      targetId: id,
      summary: '予約履歴のない開催枠を削除しました。',
    });
    writeDemoState(state);
  }

  async listBookings(slotId?: string): Promise<Booking[]> {
    return readDemoState().bookings.filter((booking) => !slotId || booking.slotId === slotId);
  }

  async listWaitlistEntries(slotId?: string): Promise<WaitlistEntry[]> {
    return readDemoState().waitlistEntries.filter((entry) => !slotId || entry.slotId === slotId);
  }

  async listNotificationJobs(status?: NotificationJob['status']): Promise<NotificationJob[]> {
    return readDemoState().notificationJobs.filter((job) => !status || job.status === status);
  }

  async createPhoneBooking(input: PhoneBookingInput): Promise<Booking> {
    const state = readDemoState();
    const booking = this.createBookingRecord(state, input, 'phone');
    if (input.sendNotification && !booking.contact.email) {
      throw new Error('通知プレビューを作成する場合はメールアドレスを入力してください。');
    }
    if (!input.sendNotification) {
      state.notificationJobs = state.notificationJobs.filter((job) => job.targetId !== booking.id);
    } else {
      const notification = state.notificationJobs.find((job) => job.targetId === booking.id);
      if (notification) {
        notification.recipientName = booking.contact.name;
        notification.recipientEmail = booking.contact.email;
      }
    }
    writeDemoState(state);
    return booking;
  }

  async cancelBookingByAdmin(id: string, reason: string): Promise<Booking> {
    const state = readDemoState();
    const booking = state.bookings.find((item) => item.id === id);
    if (!booking) throw new Error('予約が見つかりません。');
    if (booking.status !== 'confirmed' && booking.status !== 'checkedIn') throw new Error('有効な予約だけをキャンセルできます。');
    const slot = state.slots.find((item) => item.id === booking.slotId);
    if (!slot) throw new Error('開催枠が見つかりません。');

    booking.status = 'canceledByAdmin';
    booking.updatedAt = new Date().toISOString();
    const cancellationReason = reason.trim() || '管理画面から個別キャンセル';
    this.addAudit(state, {
      actor: 'demoAdmin',
      action: 'ADMIN_BOOKING_CANCELED',
      targetType: 'booking',
      targetId: booking.id,
      summary: `${booking.code}（${booking.totalPeople}名）をキャンセルしました。理由：${cancellationReason}`,
    });
    writeDemoState(state);
    return booking;
  }

  async markBookingCheckedIn(id: string): Promise<Booking> {
    const state = readDemoState();
    const booking = state.bookings.find((item) => item.id === id);
    if (!booking) throw new Error('予約が見つかりません。');
    if (booking.status !== 'confirmed') throw new Error('確定中の予約だけを受付済みにできます。');
    booking.status = 'checkedIn';
    booking.updatedAt = new Date().toISOString();
    this.addAudit(state, {
      actor: 'demoAdmin',
      action: 'BOOKING_CHECKED_IN',
      targetType: 'booking',
      targetId: booking.id,
      summary: `${booking.code}（${booking.totalPeople}名）を受付済みにしました。`,
    });
    writeDemoState(state);
    return booking;
  }

  async promoteWaitlist(id: string): Promise<Booking> {
    const state = readDemoState();
    const entry = state.waitlistEntries.find((item) => item.id === id);
    if (!entry || entry.status !== 'waiting') throw new Error('繰り上げ可能な待機申請が見つかりません。');
    const booking = this.createBookingRecord(state, { slotId: entry.slotId, party: entry.party, contact: entry.contact }, 'waitlist');
    entry.status = 'promoted';
    entry.promotedBookingId = booking.id;
    entry.updatedAt = new Date().toISOString();
    state.notificationJobs = state.notificationJobs.filter((job) => !(job.targetId === booking.id && job.type === 'bookingAccepted'));
    const rawSlot = state.slots.find((slot) => slot.id === entry.slotId)!;
    this.addNotification(state, 'waitlistPromoted', entry.id, this.calendarize(state, rawSlot));
    this.addAudit(state, { actor: 'demoAdmin', action: 'WAITLIST_PROMOTED', targetType: 'waitlist', targetId: entry.id, summary: `${entry.totalPeople}名を予約へ繰り上げました。` });
    writeDemoState(state);
    return booking;
  }

  async cancelSlot(id: string, reason: string, expectedTargetIds: string[]): Promise<Slot> {
    const state = readDemoState();
    const slot = state.slots.find((item) => item.id === id);
    if (!slot) throw new Error('開催枠が見つかりません。');
    if (slot.manualStatus === 'cancelled') throw new Error('この開催枠はすでに開催中止です。');
    const actualTargetIds = [
      ...state.bookings.filter((booking) => booking.slotId === id && (booking.status === 'confirmed' || booking.status === 'checkedIn')).map((booking) => booking.id),
      ...state.waitlistEntries.filter((entry) => entry.slotId === id && entry.status === 'waiting').map((entry) => entry.id),
    ].sort();
    const reviewedTargetIds = [...expectedTargetIds].sort();
    if (actualTargetIds.length !== reviewedTargetIds.length || actualTargetIds.some((targetId, index) => targetId !== reviewedTargetIds[index])) {
      throw new Error('確認後に予約者・待機者が更新されました。対象者をもう一度確認してください。');
    }
    slot.manualStatus = 'cancelled';
    slot.statusReason = reason || '生育・天候状況により開催を中止しました。';
    const calendarSlot = this.calendarize(state, slot);
    state.bookings.filter((booking) => booking.slotId === id && (booking.status === 'confirmed' || booking.status === 'checkedIn')).forEach((booking) => {
      booking.status = 'slotCanceled';
      booking.updatedAt = new Date().toISOString();
      this.addNotification(state, 'slotCanceled', booking.id, calendarSlot, { reason: slot.statusReason });
    });
    state.waitlistEntries.filter((entry) => entry.slotId === id && entry.status === 'waiting').forEach((entry) => {
      entry.status = 'slotCanceled';
      entry.updatedAt = new Date().toISOString();
      this.addNotification(state, 'slotCanceled', entry.id, calendarSlot, { reason: slot.statusReason });
    });
    this.addAudit(state, { actor: 'demoAdmin', action: 'SLOT_CANCELED', targetType: 'slot', targetId: slot.id, summary: slot.statusReason });
    writeDemoState(state);
    return slot;
  }

  async listAuditLogs(): Promise<AuditLog[]> {
    return readDemoState().auditLogs;
  }

  async processNotifications(): Promise<NotificationJob[]> {
    const state = readDemoState();
    const processed = state.notificationJobs.filter((job) => job.status === 'queued').slice(0, 20);
    processed.forEach((job) => { job.status = 'sent'; job.attempts += 1; });
    if (processed.length) writeDemoState(state);
    return processed;
  }

  async retryNotification(id: string): Promise<NotificationJob> {
    const state = readDemoState();
    const job = state.notificationJobs.find((item) => item.id === id);
    if (!job) throw new Error('通知履歴が見つかりません。');
    if (job.status !== 'failed') throw new Error('再送できるのは送信失敗の通知だけです。');
    job.status = 'sent';
    job.attempts += 1;
    this.addAudit(state, { actor: 'demoAdmin', action: 'NOTIFICATION_RETRIED', targetType: 'notification', targetId: job.id, summary: '通知をデモ再送しました。' });
    writeDemoState(state);
    return job;
  }

  async resetDemo(): Promise<void> {
    resetDemoState();
  }
}

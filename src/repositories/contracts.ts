import type {
  AuditLog,
  Booking,
  BookingInput,
  CalendarSlot,
  DashboardSummary,
  Experience,
  NotificationJob,
  PhoneBookingInput,
  Slot,
  SlotCreateInput,
  SlotUpdateInput,
  WaitlistEntry,
} from '../domain/types';

export interface PublicRepository {
  listExperiences(): Promise<Experience[]>;
  listCalendar(month: string): Promise<CalendarSlot[]>;
  findNextPublishedSlot(experienceId: string, from: string): Promise<CalendarSlot | null>;
  getSlot(slotId: string): Promise<CalendarSlot | null>;
}

export interface BookingRepository {
  createBooking(input: BookingInput): Promise<Booking>;
  lookupBooking(code: string, email: string): Promise<Booking | null>;
  cancelBooking(code: string, email: string): Promise<Booking | null>;
  createWaitlist(input: BookingInput): Promise<WaitlistEntry>;
}

export interface AdminRepository {
  getDashboard(): Promise<DashboardSummary>;
  listExperiences(): Promise<Experience[]>;
  listSlots(range?: { from: string; to: string }): Promise<CalendarSlot[]>;
  createSlot(input: SlotCreateInput): Promise<Slot>;
  createSlots(inputs: SlotCreateInput[]): Promise<Slot[]>;
  updateSlot(id: string, input: SlotUpdateInput): Promise<Slot>;
  deleteSlot(id: string): Promise<void>;
  listBookings(slotId?: string): Promise<Booking[]>;
  listWaitlistEntries(slotId?: string): Promise<WaitlistEntry[]>;
  listNotificationJobs(status?: NotificationJob['status']): Promise<NotificationJob[]>;
  createPhoneBooking(input: PhoneBookingInput): Promise<Booking>;
  markBookingCheckedIn(id: string): Promise<Booking>;
  cancelBookingByAdmin(id: string, reason: string): Promise<Booking>;
  promoteWaitlist(id: string): Promise<Booking>;
  cancelSlot(id: string, reason: string, expectedTargetIds: string[]): Promise<Slot>;
  listAuditLogs(): Promise<AuditLog[]>;
  processNotifications(): Promise<NotificationJob[]>;
  retryNotification(id: string): Promise<NotificationJob>;
  resetDemo(): Promise<void>;
}

export interface NotificationProvider {
  createPreview(type: NotificationJob['type'], targetId: string, context: Record<string, string>): NotificationJob;
}

export interface Services {
  mode: 'demo' | 'production';
  publicRepository: PublicRepository;
  bookingRepository: BookingRepository;
  adminRepository: AdminRepository;
}

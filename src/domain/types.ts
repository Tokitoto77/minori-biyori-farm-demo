export type ManualSlotStatus = 'normal' | 'adjusting' | 'paused' | 'cancelled';
export type PublicationStatus = 'draft' | 'published';
export type DisplaySlotStatus =
  | 'available'
  | 'few'
  | 'full'
  | 'adjusting'
  | 'paused'
  | 'cancelled'
  | 'outside';

export type BookingStatus =
  | 'confirmed'
  | 'checkedIn'
  | 'canceledByGuest'
  | 'canceledByAdmin'
  | 'slotCanceled';

export type WaitlistStatus = 'waiting' | 'promoted' | 'canceledByGuest' | 'slotCanceled';
export type BookingSource = 'web' | 'phone' | 'waitlist';
export type NotificationType = 'bookingAccepted' | 'guestCanceled' | 'waitlistPromoted' | 'slotCanceled';
export type NotificationStatus = 'queued' | 'sent' | 'failed';

export interface Party {
  adults: number;
  children: number;
  infants: number;
}

export interface Contact {
  name: string;
  email: string;
  phone: string;
  note?: string;
}

export interface Prices {
  adult: number;
  child: number;
  infant: number;
}

export interface Experience {
  id: string;
  slug: string;
  name: string;
  eyebrow: string;
  summary: string;
  description: string;
  durationMinutes: number;
  clothing: string;
  belongings: string;
  rainPolicy: string;
  accent: string;
  image: string;
}

export interface Slot {
  id: string;
  experienceId: string;
  startAt: string;
  endAt: string;
  capacity: number;
  prices: Prices;
  bookingOpenAt: string;
  bookingCloseAt: string;
  cancellationDeadline: string;
  fewThreshold: number;
  publicationStatus: PublicationStatus;
  manualStatus: ManualSlotStatus;
  statusReason?: string;
  note: string;
  waitlistSeq: number;
}

export type SlotCreateInput = Omit<Slot, 'id' | 'waitlistSeq'>;
export type SlotUpdateInput = Partial<SlotCreateInput>;

export interface CalendarSlot extends Slot {
  experience: Experience;
  bookedPeople: number;
  remaining: number;
  displayStatus: DisplaySlotStatus;
}

export interface Booking {
  id: string;
  code: string;
  slotId: string;
  contact: Contact;
  party: Party;
  totalPeople: number;
  prices: Prices;
  totalPrice: number;
  status: BookingStatus;
  source: BookingSource;
  createdAt: string;
  updatedAt: string;
}

export interface WaitlistEntry {
  id: string;
  code: string;
  slotId: string;
  contact: Contact;
  party: Party;
  totalPeople: number;
  queueNumber: number;
  status: WaitlistStatus;
  promotedBookingId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationJob {
  id: string;
  type: NotificationType;
  targetId: string;
  recipientName: string;
  recipientEmail: string;
  subject: string;
  preview: string;
  status: NotificationStatus;
  attempts: number;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actor: 'guest' | 'demoAdmin' | 'system';
  action: string;
  targetType: 'booking' | 'waitlist' | 'slot' | 'notification' | 'demo';
  targetId: string;
  summary: string;
  createdAt: string;
}

export interface DemoState {
  version: number;
  farmName: string;
  experiences: Experience[];
  slots: Slot[];
  bookings: Booking[];
  waitlistEntries: WaitlistEntry[];
  notificationJobs: NotificationJob[];
  auditLogs: AuditLog[];
}

export interface BookingInput {
  slotId: string;
  party: Party;
  contact: Contact;
}

export interface PhoneBookingInput extends BookingInput {
  sendNotification: boolean;
}

export interface DashboardSummary {
  todaySlots: CalendarSlot[];
  upcomingSlots: CalendarSlot[];
  confirmedPeople: number;
  remainingSeats: number;
  waitingGroups: number;
  failedNotifications: number;
}

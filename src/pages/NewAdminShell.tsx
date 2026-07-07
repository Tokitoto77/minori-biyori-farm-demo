import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CalendarCheck2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Clock3,
  CloudOff,
  History,
  LayoutDashboard,
  Leaf,
  LoaderCircle,
  Mail,
  Minus,
  Pause,
  Phone,
  Play,
  Plus,
  RotateCcw,
  ShieldAlert,
  TicketCheck,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { AdminRepository } from '../repositories/contracts';
import type { AuditLog, Booking, CalendarSlot, DashboardSummary, Experience, NotificationJob, Slot, WaitlistEntry } from '../domain/types';
import { buildMonthGrid, moveMonth, toLocalDateKey } from '../admin-v2/calendarGrid';

type AdminTabId = 'today' | 'slots' | 'guests' | 'notifications' | 'history';

interface AdminTab {
  id: AdminTabId;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

interface KpiItem {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  alert?: boolean;
}

const ADMIN_TABS: AdminTab[] = [
  {
    id: 'today',
    label: '本日の運営',
    eyebrow: 'TODAY',
    title: '今日の農園を整える',
    description: '受付状況、残席、対応が必要な項目をまとめて確認します。',
    icon: LayoutDashboard,
  },
  {
    id: 'slots',
    label: '開催枠',
    eyebrow: 'SCHEDULE',
    title: '収穫体験の開催枠',
    description: '公開中・準備中の開催枠と定員を管理します。',
    icon: CalendarDays,
  },
  {
    id: 'guests',
    label: '予約者',
    eyebrow: 'GUESTS',
    title: '予約者と参加人数',
    description: '来園予定のお客様と連絡状況を確認します。',
    icon: UsersRound,
  },
  {
    id: 'notifications',
    label: '通知',
    eyebrow: 'NOTICES',
    title: 'お知らせと送信状況',
    description: '予約通知や対応が必要な送信結果を確認します。',
    icon: Bell,
  },
  {
    id: 'history',
    label: '操作履歴',
    eyebrow: 'ACTIVITY',
    title: '管理画面の操作履歴',
    description: '変更内容と実行日時を時系列で確認します。',
    icon: History,
  },
];

function dateKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDay(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(iso));
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

function formatYen(value: number): string {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(value);
}

function formatJstDateTime(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function notificationTypeLabel(type: NotificationJob['type']): string {
  switch (type) {
    case 'bookingAccepted':
      return '予約完了通知';
    case 'guestCanceled':
      return '予約キャンセル通知';
    case 'waitlistPromoted':
      return 'キャンセル待ち繰り上げ通知';
    case 'slotCanceled':
      return '一括開催中止通知';
  }
}

function slotStatusMeta(status: CalendarSlot['displayStatus']): { label: string; dotClass: string; badgeClass: string } {
  switch (status) {
    case 'available':
      return { label: '受付中', dotClass: 'bg-admin-green', badgeClass: 'bg-[#E3EDE5] text-[#294F34]' };
    case 'few':
      return { label: '残り少', dotClass: 'bg-[#D97706]', badgeClass: 'bg-[#F7DFC0] text-[#713B00]' };
    case 'full':
      return { label: '満員', dotClass: 'bg-admin-red', badgeClass: 'bg-[#F4D4D2] text-[#812D29]' };
    case 'adjusting':
      return { label: '調整中', dotClass: 'bg-[#8B6A3D]', badgeClass: 'bg-[#EDE4D6] text-[#5B452A]' };
    case 'paused':
      return { label: '停止', dotClass: 'bg-admin-navy', badgeClass: 'bg-[#DDE2E8] text-admin-navy' };
    case 'cancelled':
      return { label: '中止', dotClass: 'bg-admin-red', badgeClass: 'bg-[#F4D4D2] text-[#812D29]' };
    case 'outside':
      return { label: '期間外', dotClass: 'bg-[#6B7280]', badgeClass: 'bg-[#E5E7EB] text-[#374151]' };
  }
}

function HalfModal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modalRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !modalRef.current) return;
      const focusable = Array.from(modalRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
      )).filter((element) => !element.hasAttribute('hidden'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-admin-navy/55 px-0 pt-10 backdrop-blur-[2px] sm:px-5" role="presentation">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="half-modal-title"
        aria-describedby="half-modal-description"
        tabIndex={-1}
        className="admin-half-modal max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-admin-bg-primary shadow-[0_-24px_70px_rgba(30,50,80,0.28)] focus-visible:outline-none sm:rounded-3xl"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-5 border-b border-admin-green/15 bg-admin-bg-primary/95 px-5 py-5 backdrop-blur-md sm:px-7">
          <div>
            <h2 id="half-modal-title" className="font-admin-sans text-xl font-black text-admin-navy sm:text-2xl">{title}</h2>
            <p id="half-modal-description" className="mt-1 text-xs font-semibold leading-5 text-admin-navy/60 sm:text-sm">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 shrink-0 place-items-center rounded-full text-admin-navy transition-colors hover:bg-admin-bg-secondary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-red/40"
            aria-label="閉じる"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

interface CreateSlotErrors {
  experienceId?: string;
  startTime?: string;
  capacity?: string;
  adultPrice?: string;
  childPrice?: string;
  infantPrice?: string;
  form?: string;
}

function CreateSlotModal({
  repository,
  experiences,
  selectedDate,
  onClose,
  onCreated,
}: {
  repository: AdminRepository;
  experiences: Experience[];
  selectedDate: Date;
  onClose: () => void;
  onCreated: (slot: Slot) => Promise<void>;
}) {
  const [experienceId, setExperienceId] = useState(experiences[0]?.id ?? '');
  const [startTime, setStartTime] = useState('10:00');
  const [capacity, setCapacity] = useState(20);
  const [adultPrice, setAdultPrice] = useState('2000');
  const [childPrice, setChildPrice] = useState('1200');
  const [infantPrice, setInfantPrice] = useState('0');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<CreateSlotErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const submitLockRef = useRef(false);
  const selectedDateLabel = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(selectedDate);

  function validate(): { errors: CreateSlotErrors; startAt: Date | null } {
    const nextErrors: CreateSlotErrors = {};
    if (!experienceId) nextErrors.experienceId = '※体験種別を選択してください。';

    const timeMatch = /^(\d{2}):(\d{2})$/.exec(startTime);
    let startAt: Date | null = null;
    if (!timeMatch) {
      nextErrors.startTime = '※開始時間を入力してください。';
    } else {
      const hour = Number(timeMatch[1]);
      const minute = Number(timeMatch[2]);
      startAt = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), hour, minute, 0, 0);
      if (startAt.getTime() <= Date.now() + 2 * 60 * 60 * 1000) {
        nextErrors.startTime = '※受付時間を確保するため、現在から2時間より後の枠を指定してください。';
      }
    }

    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
      nextErrors.capacity = '※定員は1〜100名で入力してください。';
    }

    const priceFields = [
      ['adultPrice', adultPrice, '大人料金'],
      ['childPrice', childPrice, '子ども料金'],
      ['infantPrice', infantPrice, '幼児料金'],
    ] as const;
    priceFields.forEach(([key, value, label]) => {
      const numericValue = Number(value);
      if (value.trim() === '' || !Number.isInteger(numericValue) || numericValue < 0) {
        nextErrors[key] = `※${label}は0円以上の整数で入力してください。`;
      }
    });

    return { errors: nextErrors, startAt };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    setErrors({});

    const validation = validate();
    if (Object.keys(validation.errors).length > 0 || !validation.startAt) {
      setErrors(validation.errors);
      submitLockRef.current = false;
      setSubmitting(false);
      return;
    }

    const experience = experiences.find((item) => item.id === experienceId);
    if (!experience) {
      setErrors({ experienceId: '※選択した体験が見つかりません。' });
      submitLockRef.current = false;
      setSubmitting(false);
      return;
    }

    const startAt = validation.startAt;
    const endAt = new Date(startAt.getTime() + experience.durationMinutes * 60 * 1000);
    const bookingCloseAt = new Date(startAt.getTime() - 2 * 60 * 60 * 1000);
    const cancellationDeadline = new Date(startAt.getTime() - 3 * 60 * 60 * 1000);

    try {
      const created = await repository.createSlot({
        experienceId,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        capacity,
        prices: {
          adult: Number(adultPrice),
          child: Number(childPrice),
          infant: Number(infantPrice),
        },
        bookingOpenAt: new Date().toISOString(),
        bookingCloseAt: bookingCloseAt.toISOString(),
        cancellationDeadline: cancellationDeadline.toISOString(),
        fewThreshold: Math.min(3, capacity),
        publicationStatus: 'published',
        manualStatus: 'normal',
        note: note.trim(),
      });
      await onCreated(created);
      onClose();
    } catch (cause) {
      setErrors({ form: cause instanceof Error ? cause.message : '開催枠を公開できませんでした。入力内容をご確認ください。' });
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }

  const fieldClass = (hasError: boolean) => `min-h-12 w-full rounded-xl border-2 bg-white px-3 text-base font-bold text-admin-navy outline-none transition-colors focus:border-admin-green focus:ring-4 focus:ring-admin-green/15 ${hasError ? 'border-admin-red' : 'border-admin-green/20'}`;

  return (
    <HalfModal
      title="開催枠を公開する"
      description={`${selectedDateLabel}に新しい予約枠を追加します。公開後すぐに利用者カレンダーへ反映されます。`}
      onClose={() => { if (!submitting) onClose(); }}
    >
      <form onSubmit={submit} noValidate className="space-y-6 px-5 py-6 sm:px-7">
        <div className="rounded-2xl border border-admin-green/20 bg-admin-bg-secondary px-4 py-3">
          <p className="text-[11px] font-black tracking-[0.14em] text-admin-green">PUBLISH DATE</p>
          <p className="mt-1 text-base font-black text-admin-navy">{selectedDateLabel}</p>
          <p className="mt-1 text-xs font-semibold text-admin-navy/65">日付を変更する場合は、一度閉じてカレンダーから別の日を選択してください。</p>
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-black text-admin-navy">体験種別 <span className="text-admin-red">必須</span></span>
          <select
            value={experienceId}
            onChange={(event) => { setExperienceId(event.target.value); setErrors((current) => ({ ...current, experienceId: undefined, form: undefined })); }}
            className={fieldClass(Boolean(errors.experienceId))}
            aria-invalid={Boolean(errors.experienceId)}
            aria-describedby={errors.experienceId ? 'create-slot-experience-error' : undefined}
          >
            <option value="">体験を選択</option>
            {experiences.map((experience) => <option key={experience.id} value={experience.id}>{experience.name}</option>)}
          </select>
          {errors.experienceId && <p id="create-slot-experience-error" className="mt-1.5 text-xs font-bold text-admin-red">{errors.experienceId}</p>}
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-black text-admin-navy">開始時間 <span className="text-admin-red">必須</span></span>
          <input
            type="time"
            value={startTime}
            onChange={(event) => { setStartTime(event.target.value); setErrors((current) => ({ ...current, startTime: undefined, form: undefined })); }}
            className={fieldClass(Boolean(errors.startTime))}
            aria-invalid={Boolean(errors.startTime)}
            aria-describedby={errors.startTime ? 'create-slot-time-error' : undefined}
          />
          {errors.startTime && <p id="create-slot-time-error" className="mt-1.5 text-xs font-bold text-admin-red">{errors.startTime}</p>}
        </label>

        <fieldset>
          <legend className="mb-2 text-sm font-black text-admin-navy">定員 <span className="text-admin-red">必須</span></legend>
          <div className={`flex min-h-16 items-center justify-between rounded-2xl border-2 bg-white p-2 ${errors.capacity ? 'border-admin-red' : 'border-admin-green/20'}`}>
            <button
              type="button"
              onClick={() => { setCapacity((value) => Math.max(0, value - 1)); setErrors((current) => ({ ...current, capacity: undefined, form: undefined })); }}
              disabled={capacity <= 0 || submitting}
              className="grid size-12 place-items-center rounded-xl border-2 border-admin-green/25 text-admin-navy hover:bg-admin-green hover:!text-white disabled:opacity-35 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-navy"
              aria-label="定員を1名減らす"
            >
              <Minus aria-hidden="true" className="size-5" strokeWidth={3} />
            </button>
            <output className="text-center text-2xl font-black tabular-nums text-admin-navy" aria-label={`定員${capacity}名`}>{capacity}<span className="ml-1 text-sm">名</span></output>
            <button
              type="button"
              onClick={() => { setCapacity((value) => Math.min(100, value + 1)); setErrors((current) => ({ ...current, capacity: undefined, form: undefined })); }}
              disabled={capacity >= 100 || submitting}
              className="grid size-12 place-items-center rounded-xl bg-admin-green !text-white hover:bg-admin-navy disabled:opacity-35 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-navy"
              aria-label="定員を1名増やす"
            >
              <Plus aria-hidden="true" className="size-5" strokeWidth={3} />
            </button>
          </div>
          {errors.capacity && <p className="mt-1.5 text-xs font-bold text-admin-red">{errors.capacity}</p>}
        </fieldset>

        <fieldset>
          <legend className="mb-3 text-sm font-black text-admin-navy">年齢別料金 <span className="text-admin-red">必須</span></legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {([
              ['大人', adultPrice, setAdultPrice, 'adultPrice'],
              ['子ども', childPrice, setChildPrice, 'childPrice'],
              ['幼児', infantPrice, setInfantPrice, 'infantPrice'],
            ] as const).map(([label, value, setter, errorKey]) => (
              <label key={errorKey} className="block">
                <span className="mb-1.5 block text-xs font-black text-admin-navy">{label}</span>
                <span className="relative block">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-black text-admin-navy/55">¥</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={value}
                    onChange={(event) => { setter(event.target.value); setErrors((current) => ({ ...current, [errorKey]: undefined, form: undefined })); }}
                    className={`${fieldClass(Boolean(errors[errorKey]))} pl-8`}
                    aria-invalid={Boolean(errors[errorKey])}
                  />
                </span>
                {errors[errorKey] && <p className="mt-1.5 text-xs font-bold leading-5 text-admin-red">{errors[errorKey]}</p>}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="mb-2 block text-sm font-black text-admin-navy">注意事項 <span className="font-semibold text-admin-navy/55">任意</span></span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={200}
            rows={4}
            placeholder="例：汚れてもよい靴でお越しください。雨天時はハウス内で開催します。"
            className="w-full rounded-xl border-2 border-admin-green/20 bg-white px-3 py-3 text-base font-semibold leading-6 text-admin-navy outline-none transition-colors focus:border-admin-green focus:ring-4 focus:ring-admin-green/15"
          />
          <span className="mt-1 block text-right text-[11px] font-semibold text-admin-navy/55">{note.length}/200</span>
        </label>

        {errors.form && (
          <div role="alert" className="rounded-xl border border-admin-red/35 bg-admin-red/8 px-4 py-3 text-sm font-bold leading-6 text-admin-red">
            {errors.form}
          </div>
        )}

        <div className="sticky bottom-0 -mx-5 border-t border-admin-green/15 bg-admin-bg-primary/95 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 backdrop-blur-md sm:-mx-7 sm:px-7">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-admin-green px-5 text-sm font-black !text-white shadow-[0_12px_28px_rgba(67,110,79,0.28)] hover:bg-admin-navy disabled:cursor-wait disabled:bg-admin-navy/55 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-red/45"
          >
            {submitting ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : <Plus aria-hidden="true" className="size-5" />}
            {submitting ? '公開処理中...' : 'この内容で公開する'}
          </button>
        </div>
      </form>
    </HalfModal>
  );
}

function GuestCountStepper({
  label,
  note,
  count,
  onDecrease,
  onIncrease,
  decreaseDisabled,
  increaseDisabled,
}: {
  label: string;
  note: string;
  count: number;
  onDecrease: () => void;
  onIncrease: () => void;
  decreaseDisabled: boolean;
  increaseDisabled: boolean;
}) {
  return (
    <div className="flex min-h-20 items-center justify-between gap-3 rounded-2xl border border-admin-green/20 bg-white/80 p-3 sm:px-4">
      <div className="min-w-0">
        <p className="text-sm font-black text-admin-navy">{label}</p>
        <p className="mt-1 text-[11px] font-semibold text-admin-navy">{note}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2" role="group" aria-label={`${label}の人数`}>
        <button
          type="button"
          onClick={onDecrease}
          disabled={decreaseDisabled}
          className="grid size-12 place-items-center rounded-xl border-2 border-admin-green/25 bg-admin-bg-primary text-admin-navy transition-colors hover:border-admin-green hover:bg-admin-green hover:!text-white disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-navy"
          aria-label={`${label}を1名減らす`}
        >
          <Minus aria-hidden="true" className="size-5" strokeWidth={3} />
        </button>
        <output className="grid min-h-12 min-w-12 place-items-center rounded-xl bg-admin-bg-secondary px-2 text-xl font-black tabular-nums text-admin-navy" aria-label={`${label}${count}名`}>
          {count}
        </output>
        <button
          type="button"
          onClick={onIncrease}
          disabled={increaseDisabled}
          className="grid size-12 place-items-center rounded-xl bg-admin-green !text-white transition-colors hover:bg-admin-navy disabled:cursor-not-allowed disabled:bg-admin-navy/30 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-navy"
          aria-label={`${label}を1名増やす`}
        >
          <Plus aria-hidden="true" className="size-5" strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}

function PhoneBookingModal({ repository, slots, onClose, onSaved }: { repository: AdminRepository; slots: CalendarSlot[]; onClose: () => void; onSaved: (booking: Booking, notificationQueued: boolean) => void }) {
  const [step, setStep] = useState(0);
  const [date, setDate] = useState('');
  const [slotId, setSlotId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [adultCount, setAdultCount] = useState(1);
  const [childCount, setChildCount] = useState(0);
  const [infantCount, setInfantCount] = useState(0);
  const [error, setError] = useState('');
  const availableSlots = useMemo(
    () => slots.filter((slot) => slot.publicationStatus === 'published' && (slot.displayStatus === 'available' || slot.displayStatus === 'few')),
    [slots],
  );
  const availableDates = useMemo(
    () => Array.from(new Map(availableSlots.map((slot) => [dateKey(slot.startAt), slot])).entries()),
    [availableSlots],
  );
  const slotsForDate = availableSlots.filter((slot) => dateKey(slot.startAt) === date);
  const selectedSlot = availableSlots.find((slot) => slot.id === slotId);
  const totalGuests = adultCount + childCount + infantCount;
  const maximumGuests = Math.min(10, selectedSlot?.remaining ?? 10);
  const canIncrease = totalGuests < maximumGuests;
  const steps = ['開催日', '時間枠', '連絡先'];

  function goNext() {
    if (step === 0 && !date) return setError('予約日を選択してください。');
    if (step === 1 && !slotId) return setError('時間枠を選択してください。');
    setError('');
    setStep((current) => Math.min(2, current + 1));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSlot) return setError('時間枠を選択し直してください。');
    if (totalGuests < 1) return setError('参加人数を1名以上選択してください。');
    if (totalGuests > 10) return setError('1グループの上限は10名です。11名以上は電話で個別調整してください。');
    if (totalGuests > selectedSlot.remaining) return setError(`残席は${selectedSlot.remaining}席です。人数を調整してください。`);
    try {
      const notificationQueued = Boolean(email.trim());
      const booking = await repository.createPhoneBooking({
        slotId: selectedSlot.id,
        party: { adults: adultCount, children: childCount, infants: infantCount },
        contact: { name, phone, email: email.trim() },
        sendNotification: notificationQueued,
      });
      onSaved(booking, notificationQueued);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '予約を登録できませんでした。');
    }
  }

  return (
    <HalfModal
      title="電話予約を追加"
      description="質問を3つに分け、電話中でも聞き漏らさず予約枠を確保します。"
      onClose={onClose}
    >
      <form onSubmit={submit} className="px-5 pb-7 pt-5 sm:px-7">
        <ol className="mb-6 grid grid-cols-3 gap-2" aria-label="電話予約の進行状況">
          {steps.map((label, index) => (
            <li key={label} className="min-w-0">
              <div className={`h-1.5 rounded-full ${index <= step ? 'bg-admin-green' : 'bg-admin-bg-secondary'}`} aria-hidden="true" />
              <p className={`mt-2 truncate text-[11px] font-extrabold ${index === step ? 'text-admin-green' : 'text-admin-navy/45'}`}>
                {index + 1}. {label}
              </p>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <fieldset>
            <legend className="font-admin-sans text-lg font-black text-admin-navy">いつ来園しますか？</legend>
            <p className="mt-1 text-xs font-semibold text-admin-navy/55">日付を先に確定すると、案内できる時間だけに絞れます。</p>
            <div className="mt-5 grid gap-3">
              {availableDates.map(([value, firstSlot]) => (
                <label key={value} className="relative flex min-h-16 cursor-pointer items-center justify-between gap-4 rounded-xl border border-admin-green/15 bg-white/75 px-4 py-3 transition-colors has-[:checked]:border-admin-green has-[:checked]:bg-admin-green/8">
                  <input className="peer sr-only" type="radio" name="booking-date" value={value} checked={date === value} onChange={() => { setDate(value); setSlotId(''); }} />
                  <span>
                    <strong className="block text-sm text-admin-navy">{formatDay(firstSlot.startAt)}</strong>
                    <small className="mt-1 block text-xs font-semibold text-admin-navy/50">{availableSlots.filter((slot) => dateKey(slot.startAt) === value).length}枠受付中</small>
                  </span>
                  <span className="grid size-7 place-items-center rounded-full border-2 border-admin-green/25 text-transparent peer-checked:border-admin-green peer-checked:bg-admin-green peer-checked:text-white">
                    <Check aria-hidden="true" className="size-4" />
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {step === 1 && (
          <fieldset>
            <legend className="font-admin-sans text-lg font-black text-admin-navy">何時の体験を予約しますか？</legend>
            <p className="mt-1 text-xs font-semibold text-admin-navy/55">残席を見ながら、無理なく受け入れられる枠を選べます。</p>
            <div className="mt-5 grid gap-3">
              {slotsForDate.map((slot) => (
                <label key={slot.id} className="relative flex min-h-20 cursor-pointer items-center justify-between gap-4 rounded-xl border border-admin-green/15 bg-white/75 px-4 py-3 transition-colors has-[:checked]:border-admin-green has-[:checked]:bg-admin-green/8">
                  <input className="peer sr-only" type="radio" name="booking-slot" value={slot.id} checked={slotId === slot.id} onChange={() => { setSlotId(slot.id); setAdultCount(1); setChildCount(0); setInfantCount(0); }} />
                  <span className="min-w-0">
                    <strong className="block text-base text-admin-navy">{formatTime(slot.startAt)}〜{formatTime(slot.endAt)}</strong>
                    <small className="mt-1 block truncate text-xs font-semibold text-admin-navy/55">{slot.experience.name}・残り{slot.remaining}席</small>
                  </span>
                  <span className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-admin-green/25 text-transparent peer-checked:border-admin-green peer-checked:bg-admin-green peer-checked:text-white">
                    <Check aria-hidden="true" className="size-4" />
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {step === 2 && (
          <fieldset>
            <legend className="font-admin-sans text-lg font-black text-admin-navy">どなたの予約ですか？</legend>
            <p className="mt-1 text-xs font-semibold text-admin-navy">人数と代表者の連絡先を確認します。メール通知は任意です。</p>
            <section aria-labelledby="phone-party-title" className="mt-5 rounded-2xl bg-admin-bg-secondary/70 p-3 sm:p-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h3 id="phone-party-title" className="text-sm font-black text-admin-navy">参加人数</h3>
                  <p className="mt-1 text-[11px] font-semibold text-admin-navy">残席と照合して、その場で確実に枠を確保します。</p>
                </div>
                <output className="rounded-xl bg-admin-green px-4 py-2 text-sm font-black text-white" aria-live="polite">合計 {totalGuests}名</output>
              </div>
              <div className="mt-4 grid gap-3">
                <GuestCountStepper label="大人" note="中学生以上" count={adultCount} onDecrease={() => setAdultCount((count) => Math.max(0, count - 1))} onIncrease={() => setAdultCount((count) => count + 1)} decreaseDisabled={adultCount === 0 || totalGuests <= 1} increaseDisabled={!canIncrease} />
                <GuestCountStepper label="子ども" note="小学生" count={childCount} onDecrease={() => setChildCount((count) => Math.max(0, count - 1))} onIncrease={() => setChildCount((count) => count + 1)} decreaseDisabled={childCount === 0 || totalGuests <= 1} increaseDisabled={!canIncrease} />
                <GuestCountStepper label="幼児" note="未就学児" count={infantCount} onDecrease={() => setInfantCount((count) => Math.max(0, count - 1))} onIncrease={() => setInfantCount((count) => count + 1)} decreaseDisabled={infantCount === 0 || totalGuests <= 1} increaseDisabled={!canIncrease} />
              </div>
              {totalGuests >= 10 ? (
                <p role="status" className="mt-3 rounded-xl bg-admin-red/10 px-4 py-3 text-xs font-black text-admin-red">上限の10名です。11名以上の団体は、別枠確保のため電話で個別調整してください。</p>
              ) : selectedSlot && totalGuests >= selectedSlot.remaining ? (
                <p role="status" className="mt-3 rounded-xl bg-[#F7DFC0] px-4 py-3 text-xs font-black text-[#713B00]">この枠の残席{selectedSlot.remaining}席をすべて確保します。</p>
              ) : null}
            </section>
            <div className="mt-5 grid gap-4">
              <label className="grid gap-2 text-sm font-extrabold text-admin-navy">
                お名前
                <input
                  required
                  minLength={2}
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="min-h-12 rounded-xl border border-admin-green/25 bg-white px-4 text-base font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-green/25"
                  placeholder="例：山田 花子"
                />
              </label>
              <label className="grid gap-2 text-sm font-extrabold text-admin-navy">
                電話番号
                <span className="relative">
                  <Phone aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-admin-green" />
                  <input
                    required
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="min-h-12 w-full rounded-xl border border-admin-green/25 bg-white pl-11 pr-4 text-base font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-green/25"
                    placeholder="例：090-1234-5678"
                  />
                </span>
              </label>
              <label className="grid gap-2 text-sm font-extrabold text-admin-navy">
                メールアドレス <span className="text-xs font-semibold text-admin-navy/45">（任意）</span>
                <span className="relative">
                  <Mail aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-admin-green" />
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="min-h-12 w-full rounded-xl border border-admin-green/25 bg-white pl-11 pr-4 text-base font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-green/25"
                    placeholder="通知が必要な場合のみ入力"
                  />
                </span>
              </label>
              <p className={`rounded-xl px-4 py-3 text-xs font-bold leading-5 ${email.trim() ? 'bg-admin-green/10 text-admin-green' : 'bg-admin-bg-secondary text-admin-navy/65'}`}>
                {email.trim()
                  ? 'メール入力済み：予約登録後に通知を送信待ちへ追加します。'
                  : 'メール未入力：通知処理を自動で省略し、電話予約だけを完了します。'}
              </p>
            </div>
          </fieldset>
        )}

        {error && <p role="alert" className="mt-5 rounded-xl bg-admin-red/10 px-4 py-3 text-sm font-bold text-admin-red">{error}</p>}

        <div className="mt-7 flex gap-3">
          {step > 0 && (
            <button
              type="button"
              onClick={() => { setError(''); setStep((current) => Math.max(0, current - 1)); }}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-admin-green/25 px-5 text-sm font-black text-admin-navy hover:bg-admin-bg-secondary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-red/35"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              戻る
            </button>
          )}
          {step < 2 ? (
            <button
              type="button"
              onClick={goNext}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-admin-green px-5 text-sm font-black !text-white hover:bg-admin-navy focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-red/40"
            >
              {step === 0 ? 'この日で時間を選ぶ' : 'この枠で連絡先を入力'}
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={totalGuests < 1 || !selectedSlot || totalGuests > selectedSlot.remaining}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-admin-green px-5 text-sm font-black !text-white hover:bg-admin-navy disabled:cursor-not-allowed disabled:bg-admin-navy/30 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-navy"
            >
              <Check aria-hidden="true" className="size-4" />
              予約枠を確保して登録
            </button>
          )}
        </div>
      </form>
    </HalfModal>
  );
}

function BulkCancellationModal({ repository, slot, bookings, waitlist, onClose, onCompleted }: { repository: AdminRepository; slot: CalendarSlot; bookings: Booking[]; waitlist: WaitlistEntry[]; onClose: () => void; onCompleted: (affectedBookings: number, affectedUsers: number) => void }) {
  const [slideValue, setSlideValue] = useState(0);
  const [reason, setReason] = useState('荒天予報のため');
  const [error, setError] = useState('');
  const targetBookings = bookings.filter((booking) => booking.slotId === slot.id && (booking.status === 'confirmed' || booking.status === 'checkedIn'));
  const targetWaitlist = waitlist.filter((entry) => entry.slotId === slot.id && entry.status === 'waiting');
  const affectedBookings = targetBookings.length;
  const affectedUsers = [...targetBookings, ...targetWaitlist].reduce((sum, item) => sum + item.totalPeople, 0);
  const expectedTargetIds = [...targetBookings.map((booking) => booking.id), ...targetWaitlist.map((entry) => entry.id)];

  async function completeIfUnlocked() {
    if (slideValue < 100) return;
    try {
      await repository.cancelSlot(slot.id, reason, expectedTargetIds);
      onCompleted(affectedBookings, affectedUsers);
      onClose();
    } catch (cause) {
      setSlideValue(0);
      setError(cause instanceof Error ? cause.message : '一括中止を実行できませんでした。');
    }
  }

  return (
    <HalfModal
      title={`${formatDay(slot.startAt)} ${formatTime(slot.startAt)}の開催を中止`}
      description="対象人数を確認してからスライドするため、誤操作と連絡漏れを防げます。"
      onClose={onClose}
    >
      <div className="px-5 pb-7 pt-5 sm:px-7">
        <div className="rounded-2xl bg-admin-red p-5 text-white shadow-[0_16px_36px_rgba(199,74,69,0.22)]">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/15">
              <ShieldAlert aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-xs font-extrabold text-white/80">影響範囲</p>
              <p className="mt-1 text-2xl font-black">{affectedBookings}件の予約を中止しますか？</p>
              <p className="mt-2 text-sm font-bold text-white/90">影響する利用者は {affectedUsers}名 です。</p>
            </div>
          </div>
        </div>

        <label className="mt-5 grid gap-2 text-sm font-extrabold text-admin-navy">
          中止理由
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="min-h-12 rounded-xl border border-admin-green/25 bg-white px-4 text-base font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-green/25"
          />
        </label>

        <div className="mt-6 rounded-2xl border border-admin-red/20 bg-white/75 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-black text-admin-navy">安全確認スライダー</span>
            <span className="text-xs font-black text-admin-red">{slideValue}%</span>
          </div>
          <label htmlFor="bulk-cancel-slider" className="mt-3 block text-xs font-bold leading-5 text-admin-navy/60">
            右端まで動かすと確定ボタンが有効になります。スライドだけでは中止されません。
          </label>
          <input
            id="bulk-cancel-slider"
            type="range"
            min="0"
            max="100"
            step="1"
            value={slideValue}
            onChange={(event) => setSlideValue(Number(event.target.value))}
            className="mt-3 min-h-11 w-full cursor-grab accent-admin-red active:cursor-grabbing focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-red/35"
            aria-valuetext={`${slideValue}%、100%で確定ボタンが有効`}
          />
          <button
            type="button"
            disabled={slideValue < 100}
            onClick={completeIfUnlocked}
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-admin-red px-5 text-sm font-black text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-red/40"
          >
            <CloudOff aria-hidden="true" className="size-4" />
            {slideValue < 100 ? '右端までスライドしてロック解除' : `${affectedUsers}名への影響を確認して中止を確定`}
          </button>
        </div>

        {error && <p role="alert" className="mt-4 rounded-xl bg-admin-red/10 px-4 py-3 text-sm font-bold text-admin-red">{error}</p>}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-admin-green/25 text-sm font-black text-admin-navy hover:bg-admin-bg-secondary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-red/35"
        >
          中止せず運営画面へ戻る
        </button>
      </div>
    </HalfModal>
  );
}

function AuditHistoryPanel({ logs }: { logs: AuditLog[] }) {
  return (
    <section aria-labelledby="audit-history-title" className="rounded-2xl border border-admin-green/15 bg-white/75 p-5 shadow-[0_14px_38px_rgba(30,50,80,0.07)] sm:p-7">
      <h2 id="audit-history-title" className="font-admin-sans text-xl font-black text-admin-navy">リアルタイム操作履歴</h2>
      <p className="mt-1 text-sm font-semibold text-admin-navy/55">予約登録・通知・中止・リセットを同じ時系列で追跡できます。</p>
      {logs.length === 0 ? (
        <p className="mt-6 rounded-xl bg-admin-bg-secondary px-4 py-6 text-center text-sm font-bold text-admin-navy/55">まだ操作履歴はありません。</p>
      ) : (
        <ol className="mt-6 divide-y divide-admin-green/10" aria-live="polite">
          {logs.map((log) => (
            <li key={log.id} className="grid gap-2 py-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-5">
              <time className="text-xs font-bold text-admin-green" dateTime={log.createdAt}>
                {new Date(log.createdAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </time>
              <div>
                <p className="text-sm font-extrabold text-admin-navy">{log.summary}</p>
                <p className="mt-1 text-[11px] font-semibold text-admin-navy/45">{log.action}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function BookingCard({ booking, slot, expanded = false }: { booking: Booking; slot?: CalendarSlot; expanded?: boolean }) {
  const detailId = `booking-detail-${booking.id}`;
  const cardId = `booking-card-${booking.id}`;
  const statusLabel = booking.status === 'checkedIn' ? '受付済み' : '予約確定';
  const sourceLabel = booking.source === 'web' ? 'Web予約' : booking.source === 'phone' ? '電話予約' : '待機繰り上げ';
  return (
    <article
      id={cardId}
      className={`group relative scroll-mt-28 overflow-hidden rounded-2xl bg-white/80 p-4 shadow-[0_10px_28px_rgba(30,50,80,0.06)] transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 sm:p-5 ${expanded ? 'border-2 border-admin-green shadow-[0_16px_38px_rgba(67,110,79,0.16)]' : 'border border-admin-green/15 hover:border-admin-green/35'}`}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4">
        <div className="flex min-w-14 flex-col items-center border-r border-admin-green/15 pr-4 text-admin-green">
          <Clock3 aria-hidden="true" className="size-4" />
          <strong className="mt-1 text-lg leading-none">{slot ? formatTime(slot.startAt) : '—'}</strong>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="font-admin-sans text-base font-black text-admin-navy sm:text-lg">
              <Link
                to={expanded ? '/admin' : `/admin?booking=${encodeURIComponent(booking.id)}`}
                aria-expanded={expanded}
                aria-controls={detailId}
                className="inline-flex min-h-11 items-center rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-4 focus-visible:after:ring-inset focus-visible:after:ring-admin-red/45"
                aria-label={`${booking.contact.name}さんの予約詳細を${expanded ? '閉じる' : '開く'}`}
              >
                {booking.contact.name}
              </Link>
            </h3>
            <span className="rounded-full bg-admin-green/10 px-2.5 py-1 text-[11px] font-extrabold text-admin-green">{statusLabel}</span>
          </div>
          <p className="truncate text-xs font-bold text-admin-navy/65 sm:text-sm">{slot?.experience.name ?? '開催枠を確認してください'}</p>
          <p className="mt-1 text-[11px] font-semibold text-admin-navy/45">{booking.totalPeople}名 ・ 予約番号 {booking.code}</p>
        </div>
        <ChevronRight aria-hidden="true" className={`size-5 text-admin-green transition-transform ${expanded ? 'rotate-90' : 'group-hover:translate-x-0.5'}`} />
      </div>
      {expanded && (
        <div id={detailId} role="region" aria-label={`${booking.contact.name}さんの予約詳細`} className="relative z-10 mt-5 border-t border-admin-green/15 pt-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-black tracking-[0.14em] text-admin-green">BOOKING DETAIL</p>
            <span className="rounded-full bg-admin-bg-secondary px-3 py-1.5 text-xs font-black text-admin-navy">{sourceLabel}</span>
          </div>
          <dl className="grid gap-x-6 gap-y-4 rounded-2xl bg-admin-bg-primary p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-bold text-admin-navy/55">代表者氏名</dt>
              <dd className="mt-1 font-black text-admin-navy">{booking.contact.name}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold text-admin-navy/55">予約番号</dt>
              <dd className="mt-1 font-black text-admin-navy">{booking.code}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold text-admin-navy/55">電話番号</dt>
              <dd className="mt-1 font-black text-admin-navy">{booking.contact.phone || '未登録'}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold text-admin-navy/55">メールアドレス</dt>
              <dd className="mt-1 break-all font-black text-admin-navy">{booking.contact.email || '未登録'}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold text-admin-navy/55">人数内訳</dt>
              <dd className="mt-1 font-black text-admin-navy">大人 {booking.party.adults}名・子ども {booking.party.children}名・幼児 {booking.party.infants}名</dd>
            </div>
            <div>
              <dt className="text-xs font-bold text-admin-navy/55">合計金額</dt>
              <dd className="mt-1 font-black text-admin-navy">{formatYen(booking.totalPrice)}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold text-admin-navy/55">開催日時</dt>
              <dd className="mt-1 font-black text-admin-navy">{slot ? `${formatDay(slot.startAt)} ${formatTime(slot.startAt)}〜${formatTime(slot.endAt)}` : '開催枠を確認してください'}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold text-admin-navy/55">登録日時</dt>
              <dd className="mt-1 font-black text-admin-navy">{formatJstDateTime(booking.createdAt)} JST</dd>
            </div>
          </dl>
          {booking.contact.note && (
            <div className="mt-4 rounded-xl border border-admin-green/15 bg-white px-4 py-3">
              <p className="text-xs font-bold text-admin-navy/55">連絡メモ</p>
              <p className="mt-1 text-sm font-bold leading-6 text-admin-navy">{booking.contact.note}</p>
            </div>
          )}
          <p className="mt-4 text-right text-xs font-bold text-admin-green">カードをもう一度押すと詳細を閉じます</p>
        </div>
      )}
    </article>
  );
}

function GuestList({
  bookings,
  slots,
  waitlist,
  expandedBookingId,
  busyWaitlistId,
  onPromoteWaitlist,
}: {
  bookings: Booking[];
  slots: CalendarSlot[];
  waitlist: WaitlistEntry[];
  expandedBookingId: string | null;
  busyWaitlistId: string;
  onPromoteWaitlist: (entry: WaitlistEntry) => Promise<void>;
}) {
  const slotMap = new Map(slots.map((slot) => [slot.id, slot]));
  const activeBookings = bookings.filter((booking) => booking.status === 'confirmed' || booking.status === 'checkedIn');
  const waitingEntries = waitlist.filter((entry) => entry.status === 'waiting');
  const requestedBookingMissing = Boolean(expandedBookingId) && !activeBookings.some((booking) => booking.id === expandedBookingId);
  return (
    <div className="space-y-10">
      <section aria-labelledby="guest-list-title">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 id="guest-list-title" className="font-admin-sans text-xl font-black text-admin-navy sm:text-2xl">予約者一覧</h2>
          <p className="rounded-full bg-admin-bg-secondary px-3 py-2 text-xs font-extrabold text-admin-green">{activeBookings.length}件</p>
        </div>
        {activeBookings.length > 0 ? (
          <div className="grid items-start gap-3 lg:grid-cols-2">{activeBookings.map((booking) => <BookingCard key={booking.id} booking={booking} slot={slotMap.get(booking.slotId)} expanded={booking.id === expandedBookingId} />)}</div>
        ) : (
          <p className="rounded-2xl border border-admin-green/15 bg-white/75 px-5 py-8 text-center text-sm font-bold text-admin-navy/60">現在、確定中の予約はありません。</p>
        )}
        {requestedBookingMissing && (
          <p role="alert" className="mt-4 rounded-xl border border-admin-red/30 bg-admin-red/8 px-4 py-3 text-sm font-bold text-admin-red">指定された予約は見つからないか、すでに有効な予約ではありません。</p>
        )}
      </section>

      <section aria-labelledby="waitlist-title" className="border-t border-admin-green/20 pt-8">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-black tracking-[0.16em] text-admin-red">WAITLIST</p>
            <h2 id="waitlist-title" className="font-admin-sans mt-1 text-xl font-black text-admin-navy sm:text-2xl">キャンセル待ち</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-admin-navy/60">空席を確認して、安全に予約へ繰り上げます。</p>
          </div>
          <p className="rounded-full bg-admin-red/10 px-3 py-2 text-xs font-extrabold text-admin-red">{waitingEntries.length}組</p>
        </div>

        {waitingEntries.length === 0 ? (
          <div className="rounded-2xl border border-admin-green/15 bg-white/75 px-5 py-9 text-center">
            <TicketCheck aria-hidden="true" className="mx-auto size-8 text-admin-green" />
            <p className="mt-3 text-sm font-black text-admin-navy">現在、繰り上げ対応が必要な待機者はいません。</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2" aria-live="polite">
            {waitingEntries.map((entry) => {
              const slot = slotMap.get(entry.slotId);
              const remaining = slot?.remaining ?? 0;
              const enoughSeats = Boolean(slot) && remaining >= entry.totalPeople;
              const slotAcceptsPromotion = slot?.publicationStatus === 'published'
                && (slot.displayStatus === 'available' || slot.displayStatus === 'few');
              const canPromote = enoughSeats && slotAcceptsPromotion;
              const isBusy = busyWaitlistId === entry.id;
              return (
                <article key={entry.id} className="rounded-2xl border border-admin-red/20 bg-white/80 p-5 shadow-[0_12px_32px_rgba(30,50,80,0.07)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black text-admin-red">待機番号 {entry.queueNumber}</p>
                      <h3 className="font-admin-sans mt-1 text-lg font-black text-admin-navy">{entry.contact.name}</h3>
                    </div>
                    <span className="rounded-full bg-admin-bg-secondary px-3 py-1.5 text-xs font-black text-admin-navy">{entry.totalPeople}名</span>
                  </div>
                  <dl className="mt-4 grid gap-2 rounded-xl bg-admin-bg-primary p-4 text-sm">
                    <div className="flex justify-between gap-4"><dt className="font-bold text-admin-navy/60">開催枠</dt><dd className="text-right font-black text-admin-navy">{slot ? `${formatDay(slot.startAt)} ${formatTime(slot.startAt)} ${slot.experience.name}` : '開催枠なし'}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="font-bold text-admin-navy/60">人数内訳</dt><dd className="text-right font-black text-admin-navy">大人 {entry.party.adults}名・子ども {entry.party.children}名・幼児 {entry.party.infants}名</dd></div>
                    <div className="flex justify-between gap-4"><dt className="font-bold text-admin-navy/60">現在の残席</dt><dd className={`text-right font-black ${enoughSeats ? 'text-admin-green' : 'text-admin-red'}`}>{slot ? `${remaining}席` : '確認不可'}</dd></div>
                  </dl>
                  {!enoughSeats && slot && (
                    <p id={`waitlist-error-${entry.id}`} className="mt-3 text-sm font-bold leading-6 text-admin-red">
                      ※残席不足のため繰り上げ不可（残り{remaining}席 / 待機グループ{entry.totalPeople}名）
                    </p>
                  )}
                  {enoughSeats && !slotAcceptsPromotion && (
                    <p id={`waitlist-error-${entry.id}`} className="mt-3 text-sm font-bold leading-6 text-admin-red">※この開催枠は現在受付中ではないため、繰り上げできません。</p>
                  )}
                  {!slot && (
                    <p id={`waitlist-error-${entry.id}`} className="mt-3 text-sm font-bold leading-6 text-admin-red">※開催枠を確認できないため、繰り上げできません。</p>
                  )}
                  <button
                    type="button"
                    disabled={!canPromote || isBusy}
                    aria-describedby={!canPromote ? `waitlist-error-${entry.id}` : undefined}
                    onClick={() => void onPromoteWaitlist(entry)}
                    className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-admin-green px-4 text-sm font-black !text-white transition-colors hover:bg-admin-navy disabled:cursor-not-allowed disabled:bg-[#737B76] disabled:!text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-red/45"
                  >
                    {isBusy ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : <TicketCheck aria-hidden="true" className="size-5" />}
                    {isBusy ? '繰り上げ処理中…' : '予約へ繰り上げる'}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function NotificationPanel({
  notifications,
  busyNotificationId,
  onRetry,
}: {
  notifications: NotificationJob[];
  busyNotificationId: string;
  onRetry: (job: NotificationJob) => Promise<void>;
}) {
  const orderedNotifications = [...notifications].sort((left, right) => {
    if (left.status === 'failed' && right.status !== 'failed') return -1;
    if (right.status === 'failed' && left.status !== 'failed') return 1;
    return (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt);
  });

  return (
    <section aria-labelledby="notification-list-title">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="notification-list-title" className="font-admin-sans text-xl font-black text-admin-navy sm:text-2xl">通知送信履歴</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-admin-navy/60">失敗した通知だけを再送できます。表示する宛先はデモ用固定値です。</p>
        </div>
        <p className="rounded-full bg-admin-bg-secondary px-3 py-2 text-xs font-extrabold text-admin-green">全{orderedNotifications.length}件</p>
      </div>

      {orderedNotifications.length === 0 ? (
        <div className="rounded-2xl border border-admin-green/15 bg-white/75 px-5 py-10 text-center">
          <Mail aria-hidden="true" className="mx-auto size-9 text-admin-green" />
          <p className="mt-3 text-sm font-black text-admin-navy">通知履歴はまだありません。</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2" aria-live="polite">
          {orderedNotifications.map((job) => {
            const isFailed = job.status === 'failed';
            const isBusy = busyNotificationId === job.id;
            const statusLabel = isFailed ? '送信失敗（デモ）' : job.status === 'sent' ? '送信完了' : '送信待ち（デモ）';
            return (
              <article key={job.id} className={`rounded-2xl border bg-white/80 p-5 shadow-[0_12px_32px_rgba(30,50,80,0.07)] ${isFailed ? 'border-admin-red/45' : 'border-admin-green/15'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`grid size-11 shrink-0 place-items-center rounded-full ${isFailed ? 'bg-admin-red text-white' : 'bg-admin-bg-secondary text-admin-green'}`}>
                      {isFailed ? <AlertTriangle aria-hidden="true" className="size-5" /> : <Mail aria-hidden="true" className="size-5" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-black tracking-[0.08em] text-admin-green">{notificationTypeLabel(job.type)}</p>
                      <h3 className="mt-1 text-base font-black leading-6 text-admin-navy">{job.subject}</h3>
                    </div>
                  </div>
                  <span className={`rounded-full px-3 py-1.5 text-xs font-black ${isFailed ? 'bg-admin-red text-white' : job.status === 'sent' ? 'bg-admin-bg-primary text-black' : 'bg-[#F7DFC0] text-[#713B00]'}`}>{statusLabel}</span>
                </div>

                <dl className="mt-5 grid gap-3 border-t border-admin-green/10 pt-4 text-sm">
                  <div className="grid gap-1 sm:grid-cols-[7rem_minmax(0,1fr)]"><dt className="font-bold text-admin-navy/55">通知種別</dt><dd className="font-black text-admin-navy">{notificationTypeLabel(job.type)}</dd></div>
                  <div className="grid gap-1 sm:grid-cols-[7rem_minmax(0,1fr)]"><dt className="font-bold text-admin-navy/55">宛先</dt><dd className="break-all font-black text-admin-navy">demo@example.invalid</dd></div>
                  <div className="grid gap-1 sm:grid-cols-[7rem_minmax(0,1fr)]"><dt className="font-bold text-admin-navy/55">最終試行日時</dt><dd className="font-black text-admin-navy"><time dateTime={job.updatedAt ?? job.createdAt}>{formatJstDateTime(job.updatedAt ?? job.createdAt)} JST</time></dd></div>
                </dl>

                {isFailed && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void onRetry(job)}
                    className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-admin-red bg-white px-4 text-sm font-black !text-admin-red transition-colors hover:bg-admin-red hover:!text-white disabled:cursor-wait disabled:opacity-55 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-red/40"
                  >
                    {isBusy ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : <AlertTriangle aria-hidden="true" className="size-5" />}
                    {isBusy ? '再送信中…' : '再送信する'}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SlotReceptionToggle({ slot, busy, onToggle }: { slot: CalendarSlot; busy: boolean; onToggle: (slot: CalendarSlot) => Promise<void> }) {
  if (slot.manualStatus !== 'normal' && slot.manualStatus !== 'paused') {
    return (
      <p className="rounded-xl bg-admin-bg-secondary px-4 py-3 text-xs font-bold leading-5 text-admin-navy">
        {slot.manualStatus === 'cancelled' ? '開催中止済みのため、受付の再開はできません。' : '生育調整を解除すると、受付の開閉を操作できます。'}
      </p>
    );
  }

  const isPaused = slot.manualStatus === 'paused';
  return (
    <button
      type="button"
      onClick={() => void onToggle(slot)}
      disabled={busy}
      aria-label={`${formatDay(slot.startAt)} ${formatTime(slot.startAt)} ${slot.experience.name}を${isPaused ? '通常受付に戻す' : '受付一時停止にする'}`}
      className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-black transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-navy disabled:cursor-wait disabled:opacity-55 ${
        isPaused
          ? 'bg-admin-green !text-white hover:bg-admin-navy'
          : 'border-2 border-admin-red/70 bg-white !text-admin-red hover:bg-admin-red hover:!text-white'
      }`}
    >
      {isPaused ? <Play aria-hidden="true" className="size-5" /> : <Pause aria-hidden="true" className="size-5" />}
      {busy ? '状態を更新中…' : isPaused ? '通常受付に戻す（開ける）' : '受付一時停止（閉める）'}
    </button>
  );
}

function SlotCalendar({
  slots,
  currentMonth,
  selectedDate,
  onMonthChange,
  onDateSelect,
  onToggleSlot,
  onCreateSlot,
  busySlotId,
}: {
  slots: CalendarSlot[];
  currentMonth: Date;
  selectedDate: Date;
  onMonthChange: (month: Date) => void;
  onDateSelect: (date: Date) => void;
  onToggleSlot: (slot: CalendarSlot) => Promise<void>;
  onCreateSlot: () => void;
  busySlotId: string;
}) {
  const monthRows = useMemo(() => buildMonthGrid(currentMonth), [currentMonth]);
  const slotsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarSlot[]>();
    slots.forEach((slot) => {
      const key = dateKey(slot.startAt);
      grouped.set(key, [...(grouped.get(key) ?? []), slot]);
    });
    grouped.forEach((items) => items.sort((left, right) => left.startAt.localeCompare(right.startAt)));
    return grouped;
  }, [slots]);
  const selectedKey = toLocalDateKey(selectedDate);
  const selectedSlots = slotsByDate.get(selectedKey) ?? [];
  const monthLabel = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long' }).format(currentMonth);
  const selectedLabel = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(selectedDate);
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

  function changeMonth(offset: number) {
    const nextMonth = moveMonth(currentMonth, offset);
    onMonthChange(nextMonth);
    onDateSelect(nextMonth);
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="slot-calendar-title" className="overflow-hidden rounded-3xl border border-admin-green/20 bg-white/75 shadow-[0_18px_55px_rgba(30,50,80,0.08)]">
        <div className="border-b border-admin-green/15 bg-admin-bg-secondary/65 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black tracking-[0.18em] text-admin-green">MONTHLY SCHEDULE</p>
              <h2 id="slot-calendar-title" className="font-admin-sans mt-1 text-xl font-black text-admin-navy sm:text-2xl">{monthLabel}</h2>
            </div>
            <button
              type="button"
              onClick={onCreateSlot}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-admin-green px-5 text-sm font-black !text-white shadow-[0_10px_24px_rgba(67,110,79,0.24)] transition-colors hover:bg-admin-navy focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-red/45 sm:w-auto"
            >
              <Plus aria-hidden="true" className="size-5" />
              開催枠を公開する
            </button>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xl border border-admin-green/25 bg-white px-3 text-sm font-black text-admin-navy transition-colors hover:bg-admin-green hover:!text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-navy"
              aria-label={`${new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long' }).format(moveMonth(currentMonth, -1))}へ移動`}
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
              <span>前月</span>
            </button>
            <p className="text-sm font-black tabular-nums text-admin-navy">{monthLabel}</p>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xl border border-admin-green/25 bg-white px-3 text-sm font-black text-admin-navy transition-colors hover:bg-admin-green hover:!text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-navy"
              aria-label={`${new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long' }).format(moveMonth(currentMonth, 1))}へ移動`}
            >
              <span>翌月</span>
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] table-fixed border-collapse" aria-label={`${monthLabel}の開催枠カレンダー`}>
            <thead>
              <tr>
                {weekdays.map((weekday) => (
                  <th key={weekday} scope="col" className="h-11 border-b border-r border-admin-green/15 bg-admin-bg-primary text-center text-xs font-black text-admin-navy last:border-r-0">
                    {weekday}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthRows.map((row, rowIndex) => (
                <tr key={`week-${rowIndex}`}>
                  {row.map((cell) => {
                    if (!cell.date || !cell.day) {
                      return <td key={cell.key} aria-hidden="true" className="h-24 border-b border-r border-admin-green/10 bg-admin-bg-primary/45 p-0 last:border-r-0" />;
                    }

                    const cellKey = toLocalDateKey(cell.date);
                    const cellSlots = slotsByDate.get(cellKey) ?? [];
                    const isSelected = selectedKey === cellKey;
                    const slotSummary = cellSlots.length
                      ? cellSlots.map((slot) => `${formatTime(slot.startAt)} ${slotStatusMeta(slot.displayStatus).label}`).join('、')
                      : '開催枠なし';

                    return (
                      <td key={cell.key} className="border-b border-r border-admin-green/10 p-0 align-top last:border-r-0">
                        <button
                          type="button"
                          onClick={() => onDateSelect(cell.date!)}
                          aria-pressed={isSelected}
                          aria-label={`${monthLabel}${cell.day}日、${slotSummary}`}
                          className={`flex min-h-24 w-full min-w-11 flex-col items-stretch gap-1 p-1.5 text-left transition-colors focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset sm:min-h-28 sm:p-2 ${
                            isSelected
                              ? 'bg-admin-green text-white shadow-[inset_0_0_0_2px_rgba(255,255,255,0.28)] focus-visible:ring-white'
                              : 'bg-white/55 text-admin-navy hover:bg-admin-bg-secondary focus-visible:ring-admin-navy'
                          }`}
                        >
                          <span className={`self-start text-sm font-black ${isSelected ? 'text-white' : 'text-admin-navy'}`}>{cell.day}</span>
                          <span className="grid gap-1">
                            {cellSlots.map((slot) => {
                              const meta = slotStatusMeta(slot.displayStatus);
                              return (
                                <span
                                  key={slot.id}
                                  className={`block rounded-md px-1 py-1 text-[9px] font-black leading-tight sm:text-[10px] ${isSelected ? 'bg-white/16 text-white' : meta.badgeClass}`}
                                >
                                  <span className={`mr-1 inline-block size-1.5 rounded-full align-middle ${isSelected ? 'bg-white' : meta.dotClass}`} aria-hidden="true" />
                                  <span className="block truncate sm:inline">{formatTime(slot.startAt)}</span>{' '}
                                  <span className="block sm:inline">{meta.label}</span>
                                </span>
                              );
                            })}
                          </span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-admin-green/15 bg-admin-bg-primary px-4 py-3 text-[11px] font-bold text-admin-navy sm:px-6" aria-label="開催枠ステータスの凡例">
          {(['available', 'few', 'full', 'adjusting', 'paused', 'cancelled', 'outside'] as const).map((status) => {
            const meta = slotStatusMeta(status);
            return <span key={status} className="inline-flex items-center gap-1.5"><span className={`size-2 rounded-full ${meta.dotClass}`} aria-hidden="true" />{meta.label}</span>;
          })}
        </div>
      </section>

      <section aria-labelledby="selected-slots-title" aria-live="polite">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black tracking-[0.16em] text-admin-green">SELECTED DATE</p>
            <h2 id="selected-slots-title" className="font-admin-sans mt-1 text-xl font-black text-admin-navy sm:text-2xl">{selectedLabel}の時間枠</h2>
          </div>
          <p className="rounded-full bg-admin-bg-secondary px-3 py-2 text-xs font-black text-admin-green">{selectedSlots.length}枠</p>
        </div>

        {selectedSlots.length === 0 ? (
          <div className="relative overflow-hidden rounded-2xl border border-dashed border-admin-green/30 bg-white/55 px-5 py-10 text-center">
            <span aria-hidden="true" className="absolute -right-6 -top-8 text-[5rem] opacity-[0.06]">🌱</span>
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-admin-green/10 text-admin-green">
              <Leaf aria-hidden="true" className="size-7" />
            </span>
            <p className="mt-4 text-sm font-black text-admin-navy">この日の開催枠は登録されていません。</p>
            <p className="mx-auto mt-2 max-w-md text-xs font-semibold leading-6 text-admin-navy/70">右上の「開催枠を公開する」ボタンから、最初の枠を作ってみましょう！🌱</p>
            <button
              type="button"
              onClick={onCreateSlot}
              className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-admin-green bg-white px-4 text-sm font-black text-admin-green hover:bg-admin-green hover:!text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-navy"
            >
              <Plus aria-hidden="true" className="size-4" />
              この日に枠を公開する
            </button>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {selectedSlots.map((slot) => {
              const meta = slotStatusMeta(slot.displayStatus);
              return (
                <article key={slot.id} className="rounded-2xl border border-admin-green/15 bg-white/80 p-5 shadow-[0_10px_28px_rgba(30,50,80,0.06)]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-black text-admin-green">{formatTime(slot.startAt)}〜{formatTime(slot.endAt)}</p>
                      <h3 className="font-admin-sans mt-1 text-lg font-black text-admin-navy">{slot.experience.name}</h3>
                    </div>
                    <span className={`inline-flex min-h-7 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black ${meta.badgeClass}`}>
                      <span className={`size-2 rounded-full ${meta.dotClass}`} aria-hidden="true" />{meta.label}
                    </span>
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-admin-green/10 pt-4 text-center">
                    <div><dt className="text-[10px] font-bold text-admin-navy">予約</dt><dd className="mt-1 text-lg font-black text-admin-navy">{slot.bookedPeople}名</dd></div>
                    <div><dt className="text-[10px] font-bold text-admin-navy">定員</dt><dd className="mt-1 text-lg font-black text-admin-navy">{slot.capacity}名</dd></div>
                    <div><dt className="text-[10px] font-bold text-admin-navy">残席</dt><dd className="mt-1 text-lg font-black text-admin-green">{slot.remaining}席</dd></div>
                  </dl>
                  <dl className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-admin-bg-secondary p-3 text-center">
                    <div><dt className="text-[10px] font-bold text-admin-navy/65">大人</dt><dd className="mt-1 text-sm font-black text-admin-navy">{formatYen(slot.prices.adult)}</dd></div>
                    <div><dt className="text-[10px] font-bold text-admin-navy/65">子ども</dt><dd className="mt-1 text-sm font-black text-admin-navy">{formatYen(slot.prices.child)}</dd></div>
                    <div><dt className="text-[10px] font-bold text-admin-navy/65">幼児</dt><dd className="mt-1 text-sm font-black text-admin-navy">{formatYen(slot.prices.infant)}</dd></div>
                  </dl>
                  <p className="mt-4 text-xs font-semibold leading-6 text-admin-navy">{slot.note || '当日の運営状況を確認して受付してください。'}</p>
                  <div className="mt-4 border-t border-admin-green/10 pt-4">
                    <SlotReceptionToggle slot={slot} busy={busySlotId === slot.id} onToggle={onToggleSlot} />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function TodayDashboard({ dashboard, bookings, slots, onAddBooking, onBulkCancellation, onCancelBooking, onCheckInBooking, onToggleSlot, busySlotId }: { dashboard: DashboardSummary; bookings: Booking[]; slots: CalendarSlot[]; onAddBooking: () => void; onBulkCancellation: () => void; onCancelBooking: (booking: Booking) => Promise<boolean>; onCheckInBooking: (booking: Booking) => Promise<boolean>; onToggleSlot: (slot: CalendarSlot) => Promise<void>; busySlotId: string }) {
  const [expandedSlotId, setExpandedSlotId] = useState<string | null>(dashboard.todaySlots[0]?.id ?? null);
  const [cancelingBookingId, setCancelingBookingId] = useState('');
  const [checkingInBookingId, setCheckingInBookingId] = useState('');
  const focusSlotIds = new Set(dashboard.todaySlots.map((slot) => slot.id));
  const focusBookings = bookings.filter((booking) => (booking.status === 'confirmed' || booking.status === 'checkedIn') && focusSlotIds.has(booking.slotId));
  const slotMap = new Map(slots.map((slot) => [slot.id, slot]));
  const kpis: KpiItem[] = [
    { label: '本日の予約', value: `${focusBookings.length}組`, note: `${dashboard.todaySlots.length}つの開催枠`, icon: CalendarCheck2 },
    { label: '来園予定', value: `${dashboard.confirmedPeople}名`, note: '対象開催枠の合計', icon: UsersRound },
    { label: '残席', value: `${dashboard.remainingSeats}席`, note: '現在受付できる席数', icon: TicketCheck },
    { label: '通知失敗', value: `${dashboard.failedNotifications}件`, note: dashboard.failedNotifications ? '再送対応が必要' : 'すべて正常', icon: dashboard.failedNotifications ? AlertTriangle : Bell, alert: dashboard.failedNotifications > 0 },
  ];
  return (
    <div className="space-y-9">
      <section aria-labelledby="today-kpi-title">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black tracking-[0.16em] text-admin-green">OVERVIEW</p>
            <h2 id="today-kpi-title" className="font-admin-sans mt-1 text-xl font-black text-admin-navy sm:text-2xl">
              今日の状況
            </h2>
          </div>
          <p className="text-xs font-bold text-admin-navy/50">{dashboard.todaySlots[0] ? formatDay(dashboard.todaySlots[0].startAt) : '開催枠なし'}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((item) => {
            const Icon = item.icon;

            return (
              <article
                key={item.label}
                className={`min-h-36 rounded-2xl p-4 sm:p-5 ${
                  item.alert
                    ? 'bg-admin-red text-white shadow-[0_16px_34px_rgba(199,74,69,0.24)]'
                    : 'border border-admin-green/10 bg-admin-bg-secondary text-admin-navy'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className={`text-xs font-extrabold ${item.alert ? 'text-white/80' : 'text-admin-navy/60'}`}>{item.label}</p>
                  <span className={`grid size-9 shrink-0 place-items-center rounded-full ${item.alert ? 'bg-white/16' : 'bg-admin-bg-primary text-admin-green'}`}>
                    <Icon aria-hidden="true" className="size-4.5" strokeWidth={2.2} />
                  </span>
                </div>
                <p className="mt-2 text-3xl font-black tracking-[-0.04em]">{item.value}</p>
                <p className={`mt-2 text-[11px] font-bold leading-5 ${item.alert ? 'text-white/85' : 'text-admin-navy/55'}`}>{item.note}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="today-slots-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black tracking-[0.16em] text-admin-green">ARRIVALS</p>
            <h2 id="today-slots-title" className="font-admin-sans mt-1 text-xl font-black text-admin-navy sm:text-2xl">本日の開催枠状況</h2>
          </div>
          <p className="text-xs font-bold text-admin-navy">枠を押すと予約者全員を確認できます</p>
        </div>

        <div className="grid gap-3">
          {dashboard.todaySlots.map((slot) => {
            const isExpanded = expandedSlotId === slot.id;
            const slotBookings = focusBookings.filter((booking) => booking.slotId === slot.id);
            const status = slotStatusMeta(slot.displayStatus);
            return (
              <article key={slot.id} className={`overflow-hidden rounded-2xl border bg-white/80 shadow-[0_12px_32px_rgba(30,50,80,0.07)] transition-colors ${isExpanded ? 'border-admin-green/45' : 'border-admin-green/15'}`}>
                <button
                  type="button"
                  onClick={() => setExpandedSlotId((current) => current === slot.id ? null : slot.id)}
                  aria-expanded={isExpanded}
                  aria-controls={`slot-guests-${slot.id}`}
                  className="grid min-h-20 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 text-left hover:bg-admin-bg-secondary/65 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-admin-navy sm:gap-5 sm:px-5"
                >
                  <span className="grid min-w-16 place-items-center rounded-xl bg-admin-bg-secondary px-3 py-2 text-admin-green">
                    <Clock3 aria-hidden="true" className="size-4" />
                    <strong className="mt-1 text-lg leading-none">{formatTime(slot.startAt)}</strong>
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <strong className="truncate text-base font-black text-admin-navy">{slot.experience.name}</strong>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black ${status.badgeClass}`}><span className={`size-1.5 rounded-full ${status.dotClass}`} aria-hidden="true" />{status.label}</span>
                    </span>
                    <span className="mt-1 block text-xs font-bold text-admin-navy">{slotBookings.length}組・{slot.bookedPeople}名予約／残席{slot.remaining}席</span>
                  </span>
                  <ChevronRight aria-hidden="true" className={`size-5 text-admin-green transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </button>

                <div className="border-t border-admin-green/10 bg-white px-4 py-3 sm:px-5">
                  <SlotReceptionToggle slot={slot} busy={busySlotId === slot.id} onToggle={onToggleSlot} />
                </div>

                {isExpanded && (
                  <div id={`slot-guests-${slot.id}`} className="border-t border-admin-green/15 bg-admin-bg-primary px-4 py-4 sm:px-5 sm:py-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-black text-admin-navy">この枠の予約者</h3>
                      <span className="rounded-full bg-admin-green px-3 py-1.5 text-xs font-black text-white">合計 {slot.bookedPeople}名</span>
                    </div>
                    {slotBookings.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-admin-green/25 bg-white/70 px-4 py-6 text-center text-sm font-bold text-admin-navy">現在、確定予約はありません。</p>
                    ) : (
                      <ul className="grid gap-3" aria-label={`${formatDay(slot.startAt)} ${formatTime(slot.startAt)}の予約者一覧`}>
                        {slotBookings.map((booking) => {
                          const partyDetails = [
                            booking.party.adults ? `大人 ${booking.party.adults}名` : '',
                            booking.party.children ? `子ども ${booking.party.children}名` : '',
                            booking.party.infants ? `幼児 ${booking.party.infants}名` : '',
                          ].filter(Boolean).join('、');
                          const apologySubject = `${slot.experience.name}に関するお詫び`;
                          const apologyBody = `${booking.contact.name} 様\n\n${formatDay(slot.startAt)} ${formatTime(slot.startAt)}の${slot.experience.name}についてご連絡いたします。\nご迷惑をおかけし申し訳ございません。詳細は農園より改めてご案内いたします。`;
                          const mailto = `mailto:${encodeURIComponent(booking.contact.email)}?subject=${encodeURIComponent(apologySubject)}&body=${encodeURIComponent(apologyBody)}`;
                          return (
                            <li key={booking.id} className="rounded-2xl border border-admin-green/15 bg-white p-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-base font-black text-admin-navy">{booking.contact.name}</p>
                                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${booking.status === 'checkedIn' ? 'bg-admin-navy !text-white' : 'bg-admin-green/10 text-admin-green'}`}>{booking.status === 'checkedIn' ? '受付済' : '確定'}</span>
                                    <span className="rounded-full bg-admin-bg-secondary px-2.5 py-1 text-[10px] font-black text-admin-navy">{booking.source === 'phone' ? '電話' : booking.source === 'web' ? 'Web' : '待機繰上'}</span>
                                  </div>
                                  <p className="mt-2 text-xs font-bold text-admin-navy">{partyDetails}（合計 {booking.totalPeople}名）</p>
                                  <p className="mt-1 text-[11px] font-semibold text-admin-navy">予約番号 {booking.code}</p>
                                </div>
                                <a href={`tel:${booking.contact.phone}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-admin-green/25 bg-admin-bg-primary px-3 text-sm font-black !text-admin-navy hover:bg-admin-green hover:!text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-navy" aria-label={`${booking.contact.name}さんへ電話する`}>
                                  <Phone aria-hidden="true" className="size-4" />{booking.contact.phone}
                                </a>
                              </div>
                              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-admin-green/10 pt-4 sm:grid-cols-3">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setCheckingInBookingId(booking.id);
                                    try { await onCheckInBooking(booking); } finally { setCheckingInBookingId(''); }
                                  }}
                                  disabled={booking.status === 'checkedIn' || checkingInBookingId === booking.id}
                                  className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-admin-green px-3 text-xs font-black !text-white hover:bg-admin-navy disabled:cursor-default disabled:bg-admin-navy disabled:opacity-75 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-navy sm:col-span-1"
                                >
                                  <Check aria-hidden="true" className="size-4" />{booking.status === 'checkedIn' ? '受付済み' : checkingInBookingId === booking.id ? '受付処理中…' : '受付済みにする'}
                                </button>
                                <a href={mailto} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-admin-green/30 bg-white px-3 text-xs font-black !text-admin-green hover:bg-admin-green hover:!text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-navy" aria-label={`${booking.contact.name}さんへお詫びメールを作成`}>
                                  <Mail aria-hidden="true" className="size-4" />お詫びメール
                                </a>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setCancelingBookingId(booking.id);
                                    try { await onCancelBooking(booking); } finally { setCancelingBookingId(''); }
                                  }}
                                  disabled={cancelingBookingId === booking.id}
                                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-admin-red px-3 text-xs font-black !text-white hover:bg-[#A93531] disabled:cursor-wait disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-navy"
                                >
                                  <X aria-hidden="true" className="size-4" />{cancelingBookingId === booking.id ? '処理中…' : '予約をキャンセル'}
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="today-bookings-title">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black tracking-[0.16em] text-admin-green">GUESTS</p>
            <h2 id="today-bookings-title" className="font-admin-sans mt-1 text-xl font-black text-admin-navy sm:text-2xl">
              本日の予約者
            </h2>
          </div>
          <p className="rounded-full bg-admin-bg-secondary px-3 py-2 text-xs font-extrabold text-admin-green">{focusBookings.length}件表示</p>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {focusBookings.map((booking) => <BookingCard key={booking.id} booking={booking} slot={slotMap.get(booking.slotId)} />)}
        </div>
      </section>

      <section aria-labelledby="safety-controls-title" className="rounded-2xl border border-admin-red/20 bg-admin-red/6 p-5 sm:p-6">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-admin-red text-white">
              <CloudOff aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-xs font-black tracking-[0.15em] text-admin-red">SAFETY CONTROL</p>
              <h2 id="safety-controls-title" className="font-admin-sans mt-1 text-lg font-black text-admin-navy">荒天時の一括中止</h2>
              <p className="mt-2 max-w-2xl text-xs font-semibold leading-6 text-admin-navy/60 sm:text-sm">
                対象人数を確認してから実行するため、誤操作を防ぎ、予約者への連絡対象を正確に残せます。
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onBulkCancellation}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-admin-red/35 bg-white px-5 text-sm font-black text-admin-red hover:bg-admin-red hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-red/35"
          >
            <ShieldAlert aria-hidden="true" className="size-4" />
            影響人数を確認して中止する
          </button>
        </div>
      </section>

      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 px-3 sm:px-6">
        <div className="mx-auto flex max-w-6xl justify-end">
          <button
            type="button"
            onClick={onAddBooking}
            className="pointer-events-auto inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-admin-green px-6 text-sm font-black !text-white shadow-[0_14px_30px_rgba(67,110,79,0.3)] transition-colors hover:bg-admin-navy focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-red/45 sm:w-auto"
          >
            <Plus aria-hidden="true" className="size-5" />
            予約を追加
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NewAdminShell({ repository, revision, onChanged }: { repository: AdminRepository; revision: number; onChanged: () => void }) {
  const [searchParams] = useSearchParams();
  const bookingIdFromUrl = searchParams.get('booking')?.trim() || null;
  const [activeTab, setActiveTab] = useState<AdminTabId>('today');
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(bookingIdFromUrl);
  const [currentMonth, setCurrentMonth] = useState(() => new Date(2026, 6, 1));
  const [selectedDate, setSelectedDate] = useState(() => new Date(2026, 6, 16));
  const [phoneBookingOpen, setPhoneBookingOpen] = useState(false);
  const [createSlotOpen, setCreateSlotOpen] = useState(false);
  const [bulkCancellationOpen, setBulkCancellationOpen] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [slots, setSlots] = useState<CalendarSlot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [notifications, setNotifications] = useState<NotificationJob[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [busySlotId, setBusySlotId] = useState('');
  const [busyWaitlistId, setBusyWaitlistId] = useState('');
  const [busyNotificationId, setBusyNotificationId] = useState('');
  const currentTab = ADMIN_TABS.find((tab) => tab.id === activeTab) ?? ADMIN_TABS[0];
  const ActiveIcon = currentTab.icon;
  const cancellationSlot = dashboard?.todaySlots.find((slot) => slot.manualStatus !== 'cancelled');

  async function load() {
    const [nextDashboard, nextExperiences, nextSlots, nextBookings, nextWaitlist, nextNotifications, nextLogs] = await Promise.all([
      repository.getDashboard(),
      repository.listExperiences(),
      repository.listSlots(),
      repository.listBookings(),
      repository.listWaitlistEntries(),
      repository.listNotificationJobs(),
      repository.listAuditLogs(),
    ]);
    setDashboard(nextDashboard);
    setExperiences(nextExperiences);
    setSlots(nextSlots);
    setBookings(nextBookings);
    setWaitlist(nextWaitlist);
    setNotifications(nextNotifications);
    setAuditLogs(nextLogs);
  }

  useEffect(() => {
    void load();
  }, [repository, revision]);

  useEffect(() => {
    if (bookingIdFromUrl) {
      setActiveTab('guests');
      setExpandedBookingId(bookingIdFromUrl);
      return;
    }
    setExpandedBookingId(null);
  }, [bookingIdFromUrl]);

  useEffect(() => {
    if (activeTab !== 'guests' || !expandedBookingId) return;
    if (!bookings.some((booking) => booking.id === expandedBookingId)) return;
    const animationFrame = window.requestAnimationFrame(() => {
      document.getElementById(`booking-card-${expandedBookingId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [activeTab, bookings, expandedBookingId]);

  function handleBookingSaved(booking: Booking, notificationQueued: boolean) {
    setStatusMessage(
      notificationQueued
        ? `${booking.contact.name}さんの予約を確保し、メール通知を送信待ちへ追加しました。`
        : `${booking.contact.name}さんの予約を確保しました。メール未入力のため通知は省略しています。`,
    );
    onChanged();
    void load();
  }

  async function handleDemoReset() {
    const accepted = window.confirm('新管理画面のデモデータを初期状態へ戻します。次の商談を同じ条件で始めるための操作です。実行しますか？');
    if (!accepted) return;
    await repository.resetDemo();
    onChanged();
    await load();
    setStatusMessage('デモデータを初期状態へ戻しました。次の案内を同じ条件で開始できます。');
    setActiveTab('history');
  }

  async function handleBookingCancellation(booking: Booking): Promise<boolean> {
    const accepted = window.confirm(`${booking.contact.name}さんの予約（${booking.totalPeople}名）をキャンセルします。\nこの操作で対象枠の残席が${booking.totalPeople}席戻ります。実行しますか？`);
    if (!accepted) return false;
    try {
      await repository.cancelBookingByAdmin(booking.id, '管理画面の開催枠詳細から個別キャンセル');
      onChanged();
      await load();
      setStatusMessage(`${booking.contact.name}さんの予約${booking.totalPeople}名分をキャンセルし、残席へ戻しました。`);
      return true;
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : '予約をキャンセルできませんでした。');
      return false;
    }
  }

  async function handleBookingCheckIn(booking: Booking): Promise<boolean> {
    try {
      await repository.markBookingCheckedIn(booking.id);
      onChanged();
      await load();
      setStatusMessage(`${booking.contact.name}さん（${booking.totalPeople}名）を受付済みにしました。`);
      return true;
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : '受付処理を完了できませんでした。');
      return false;
    }
  }

  async function handleSlotReceptionToggle(slot: CalendarSlot): Promise<void> {
    const pause = slot.manualStatus === 'normal';
    setBusySlotId(slot.id);
    try {
      await repository.setSlotPaused(slot.id, pause);
      onChanged();
      await load();
      setStatusMessage(
        pause
          ? `${formatDay(slot.startAt)} ${formatTime(slot.startAt)} ${slot.experience.name}を受付停止にしました。予約済みのお客様は保持されています。`
          : `${formatDay(slot.startAt)} ${formatTime(slot.startAt)} ${slot.experience.name}の受付を再開しました。空席分の予約を受け付けます。`,
      );
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : '開催枠の受付状態を変更できませんでした。');
    } finally {
      setBusySlotId('');
    }
  }

  async function handleSlotCreated(slot: Slot): Promise<void> {
    const experience = experiences.find((item) => item.id === slot.experienceId);
    onChanged();
    await load();
    setStatusMessage(`${formatDay(slot.startAt)} ${formatTime(slot.startAt)} ${experience?.name ?? '収穫体験'}を定員${slot.capacity}名で公開しました。利用者カレンダーへ反映されています。`);
  }

  async function handlePromoteWaitlist(entry: WaitlistEntry): Promise<void> {
    const slot = slots.find((item) => item.id === entry.slotId);
    if (!slot || slot.remaining < entry.totalPeople) {
      setStatusMessage('残席が不足しているため、待機グループを繰り上げできませんでした。');
      return;
    }
    setBusyWaitlistId(entry.id);
    try {
      await repository.promoteWaitlist(entry.id);
      onChanged();
      await load();
      setStatusMessage(`${entry.contact.name}さんの待機グループ${entry.totalPeople}名を予約へ繰り上げ、残席を更新しました。`);
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : '待機グループを予約へ繰り上げできませんでした。');
    } finally {
      setBusyWaitlistId('');
    }
  }

  async function handleRetryNotification(job: NotificationJob): Promise<void> {
    setBusyNotificationId(job.id);
    try {
      await repository.retryNotification(job.id);
      onChanged();
      await load();
      setStatusMessage(`${notificationTypeLabel(job.type)}を再送し、送信完了へ更新しました。通知失敗件数にも反映されています。`);
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : '通知を再送できませんでした。');
    } finally {
      setBusyNotificationId('');
    }
  }

  if (!dashboard) return <div className="grid min-h-dvh place-items-center bg-admin-bg-primary font-admin-sans font-bold text-admin-green">管理画面を準備しています…</div>;

  return (
    <div className="min-h-dvh bg-admin-bg-primary font-admin-sans text-admin-navy antialiased">
      <a
        href="#admin-main"
        className="fixed left-3 top-3 z-[60] -translate-y-24 rounded-md bg-admin-navy px-4 py-3 text-sm font-bold text-white transition-transform focus-visible:translate-y-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-red/35"
      >
        メインコンテンツへ移動
      </a>

      <header className="fixed inset-x-0 top-0 z-50 border-b border-admin-green/20 bg-admin-bg-primary/95 backdrop-blur-md md:border-admin-navy md:bg-admin-navy/95">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-admin-green text-white shadow-sm md:bg-admin-bg-primary md:text-admin-green">
              <Leaf aria-hidden="true" className="size-5" strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold tracking-[0.08em] text-admin-navy sm:text-base md:text-admin-bg-primary">
                みのり日和ファーム
              </p>
              <p className="truncate text-[11px] font-semibold text-admin-green md:text-admin-bg-secondary">運営管理</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link
              to="/"
              className="hidden min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-admin-bg-primary/35 px-4 text-xs font-extrabold !text-admin-bg-primary transition-colors hover:border-admin-green hover:bg-admin-green hover:!text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-bg-primary/60 md:inline-flex"
              aria-label="一般予約の利用者画面へ戻る"
            >
              <Leaf aria-hidden="true" className="size-4" />
              サイトを確認する
            </Link>
            <nav aria-label="グローバルナビゲーション">
              <button
                type="button"
                onClick={() => setActiveTab('today')}
                className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-xs font-extrabold text-admin-navy transition-colors hover:bg-admin-bg-secondary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-red/40 md:text-admin-bg-primary md:hover:bg-admin-green"
              >
                <LayoutDashboard aria-hidden="true" className="size-4" />
                <span className="hidden md:inline">本日の運営</span>
              </button>
            </nav>
            <button
              type="button"
              onClick={handleDemoReset}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-xs font-extrabold text-admin-red transition-colors hover:bg-admin-red/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-red/40 md:text-admin-bg-primary md:hover:bg-admin-red"
              aria-label="デモデータを初期状態へ戻す"
              title="次の商談を同じ条件で開始できます"
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              <span className="hidden lg:inline">デモを初期化</span>
            </button>
            <span className="hidden items-center gap-2 rounded-full bg-admin-bg-secondary px-3 py-2 text-xs font-bold text-admin-green sm:inline-flex md:bg-admin-bg-primary/12 md:text-admin-bg-primary">
              <span className="size-2 rounded-full bg-admin-green" aria-hidden="true" />
              デモ環境
            </span>
            <div className="flex items-center gap-2" aria-label="ログイン中の利用者">
              <CircleUserRound aria-hidden="true" className="size-7 text-admin-navy/70 md:text-admin-bg-primary" />
              <span className="hidden text-xs font-bold sm:inline md:text-admin-bg-primary">農園スタッフ</span>
            </div>
          </div>
        </div>
      </header>

      <main id="admin-main" className="mx-auto min-h-dvh max-w-6xl px-4 pb-48 pt-24 sm:px-6 lg:px-8">
        {statusMessage && (
          <div role="status" className="mb-5 flex items-start gap-3 rounded-xl border border-admin-green/20 bg-admin-green/10 px-4 py-3 text-sm font-bold leading-6 text-admin-green">
            <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}
        <section
          id="admin-active-panel"
          role="tabpanel"
          aria-labelledby={`admin-tab-${currentTab.id}`}
          tabIndex={0}
          className="focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-green/30"
        >
          <div className="mb-8 grid gap-5 border-b border-admin-green/20 pb-7 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div>
              <div className="mb-3 flex items-center gap-2 text-xs font-black tracking-[0.18em] text-admin-green">
                <ActiveIcon aria-hidden="true" className="size-4" />
                {currentTab.eyebrow}
              </div>
              <h1 className="font-admin-sans text-3xl font-black leading-tight tracking-[-0.035em] text-admin-navy sm:text-4xl">
                {currentTab.title}
              </h1>
              <p className="mt-3 max-w-2xl text-sm font-medium leading-7 text-admin-navy/70 sm:text-base">
                {currentTab.description}
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs font-bold text-admin-navy/55">
              <span>管理画面</span>
              <ChevronRight aria-hidden="true" className="size-4" />
              <span className="text-admin-green">{currentTab.label}</span>
            </div>
          </div>

          {activeTab === 'today' ? (
            <TodayDashboard
              dashboard={dashboard}
              bookings={bookings}
              slots={slots}
              onAddBooking={() => setPhoneBookingOpen(true)}
              onBulkCancellation={() => cancellationSlot ? setBulkCancellationOpen(true) : setStatusMessage('中止できる開催枠はありません。')}
              onCancelBooking={handleBookingCancellation}
              onCheckInBooking={handleBookingCheckIn}
              onToggleSlot={handleSlotReceptionToggle}
              busySlotId={busySlotId}
            />
          ) : activeTab === 'slots' ? (
            <SlotCalendar
              slots={slots}
              currentMonth={currentMonth}
              selectedDate={selectedDate}
              onMonthChange={setCurrentMonth}
              onDateSelect={setSelectedDate}
              onToggleSlot={handleSlotReceptionToggle}
              onCreateSlot={() => setCreateSlotOpen(true)}
              busySlotId={busySlotId}
            />
          ) : activeTab === 'guests' ? (
            <GuestList
              bookings={bookings}
              slots={slots}
              waitlist={waitlist}
              expandedBookingId={expandedBookingId}
              busyWaitlistId={busyWaitlistId}
              onPromoteWaitlist={handlePromoteWaitlist}
            />
          ) : activeTab === 'notifications' ? (
            <NotificationPanel
              notifications={notifications}
              busyNotificationId={busyNotificationId}
              onRetry={handleRetryNotification}
            />
          ) : activeTab === 'history' ? (
            <AuditHistoryPanel logs={auditLogs} />
          ) : (
            <div className="relative overflow-hidden rounded-2xl border border-admin-green/15 bg-white/70 shadow-[0_18px_50px_rgba(30,50,80,0.08)]">
              <div
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#436E4F_0%,#436E4F_68%,#C74A45_68%,#C74A45_100%)]"
              />
              <div className="grid min-h-[22rem] place-items-center px-6 py-14 text-center sm:px-10">
                <div className="max-w-md">
                  <span className="mx-auto grid size-16 place-items-center rounded-full bg-admin-bg-secondary text-admin-green">
                    <ActiveIcon aria-hidden="true" className="size-7" strokeWidth={1.8} />
                  </span>
                  <h2 className="font-admin-sans mt-6 text-xl font-black text-admin-navy">{currentTab.label}のコンテンツ領域</h2>
                  <p className="mt-3 text-sm font-medium leading-7 text-admin-navy/60">
                    このシェルに、次のSTEPで指定される機能と情報設計を追加します。
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-50 border-t border-admin-green/20 bg-admin-bg-primary/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_35px_rgba(30,50,80,0.08)] backdrop-blur-md">
        <nav aria-label="管理画面の主要メニュー" className="mx-auto max-w-6xl overflow-x-auto overscroll-x-contain px-2 sm:px-4">
          <div className="flex min-w-max items-stretch md:min-w-0">
            <Link
              to="/"
              className="group relative flex min-h-20 min-w-[7.25rem] flex-col items-center justify-center gap-1.5 px-3 text-xs font-extrabold text-admin-navy/70 transition-colors hover:bg-admin-bg-secondary/65 hover:text-admin-green focus-visible:z-10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-admin-red/45 md:hidden"
              aria-label="一般予約の利用者画面へ戻る"
            >
              <span aria-hidden="true" className="absolute inset-x-5 top-0 h-1 rounded-b-full bg-transparent transition-colors group-hover:bg-admin-green/20" />
              <Leaf aria-hidden="true" className="size-5" strokeWidth={1.9} />
              <span className="whitespace-nowrap">利用者画面</span>
            </Link>
            <div role="tablist" aria-label="管理機能" className="flex min-w-max flex-1 items-stretch md:min-w-0">
              {ADMIN_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = tab.id === activeTab;

                return (
                  <button
                    key={tab.id}
                    id={`admin-tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls="admin-active-panel"
                    onClick={() => setActiveTab(tab.id)}
                    className={`group relative flex min-h-20 min-w-[7.25rem] flex-1 flex-col items-center justify-center gap-1.5 px-3 text-xs font-extrabold transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-admin-red/45 md:min-w-0 ${
                      isActive
                        ? 'text-admin-green'
                        : 'text-admin-navy/60 hover:bg-admin-bg-secondary/65 hover:text-admin-navy'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute inset-x-5 top-0 h-1 rounded-b-full transition-colors ${isActive ? 'bg-admin-green' : 'bg-transparent group-hover:bg-admin-green/20'}`}
                    />
                    <Icon aria-hidden="true" className="size-5" strokeWidth={isActive ? 2.4 : 1.9} />
                    <span className="whitespace-nowrap">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </nav>
      </footer>

      {phoneBookingOpen && (
        <PhoneBookingModal
          repository={repository}
          slots={slots}
          onClose={() => setPhoneBookingOpen(false)}
          onSaved={handleBookingSaved}
        />
      )}
      {createSlotOpen && (
        <CreateSlotModal
          repository={repository}
          experiences={experiences}
          selectedDate={selectedDate}
          onClose={() => setCreateSlotOpen(false)}
          onCreated={handleSlotCreated}
        />
      )}
      {bulkCancellationOpen && cancellationSlot && (
        <BulkCancellationModal
          repository={repository}
          slot={cancellationSlot}
          bookings={bookings}
          waitlist={waitlist}
          onClose={() => setBulkCancellationOpen(false)}
          onCompleted={(affectedBookings, affectedUsers) => {
            setStatusMessage(`${affectedBookings}件・${affectedUsers}名を対象に一括中止し、監査ログへ記録しました。`);
            onChanged();
            void load();
          }}
        />
      )}
    </div>
  );
}

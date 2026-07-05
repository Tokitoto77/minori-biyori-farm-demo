import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CalendarCheck2,
  CalendarDays,
  Check,
  ChevronRight,
  CircleUserRound,
  Clock3,
  CloudOff,
  History,
  LayoutDashboard,
  Leaf,
  Mail,
  Phone,
  Plus,
  RotateCcw,
  ShieldAlert,
  TicketCheck,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { AdminRepository } from '../repositories/contracts';
import type { AuditLog, Booking, CalendarSlot, DashboardSummary, NotificationJob, WaitlistEntry } from '../domain/types';

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
        className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-admin-bg-primary shadow-[0_-24px_70px_rgba(30,50,80,0.28)] focus-visible:outline-none sm:rounded-3xl"
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

function PhoneBookingModal({ repository, slots, onClose, onSaved }: { repository: AdminRepository; slots: CalendarSlot[]; onClose: () => void; onSaved: (booking: Booking, notificationQueued: boolean) => void }) {
  const [step, setStep] = useState(0);
  const [date, setDate] = useState('');
  const [slotId, setSlotId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
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
    try {
      const notificationQueued = Boolean(email.trim());
      const booking = await repository.createPhoneBooking({
        slotId: selectedSlot.id,
        party: { adults: 1, children: 0, infants: 0 },
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
                  <input className="peer sr-only" type="radio" name="booking-slot" value={slot.id} checked={slotId === slot.id} onChange={() => setSlotId(slot.id)} />
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
            <p className="mt-1 text-xs font-semibold text-admin-navy/55">名前と電話番号だけで登録できます。メール通知は任意です。</p>
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
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-admin-green px-5 text-sm font-black text-white hover:bg-admin-navy focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-red/40"
            >
              {step === 0 ? 'この日で時間を選ぶ' : 'この枠で連絡先を入力'}
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          ) : (
            <button
              type="submit"
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-admin-green px-5 text-sm font-black text-white hover:bg-admin-navy focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-red/40"
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
  const targetBookings = bookings.filter((booking) => booking.slotId === slot.id && booking.status === 'confirmed');
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

function BookingCard({ booking, slot }: { booking: Booking; slot?: CalendarSlot }) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-admin-green/15 bg-white/80 p-4 shadow-[0_10px_28px_rgba(30,50,80,0.06)] transition-transform hover:-translate-y-0.5 hover:border-admin-green/35 sm:p-5">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4">
        <div className="flex min-w-14 flex-col items-center border-r border-admin-green/15 pr-4 text-admin-green">
          <Clock3 aria-hidden="true" className="size-4" />
          <strong className="mt-1 text-lg leading-none">{slot ? formatTime(slot.startAt) : '—'}</strong>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="font-admin-sans text-base font-black text-admin-navy sm:text-lg">
              <a href={`/admin?booking=${encodeURIComponent(booking.id)}`} className="inline-flex min-h-11 items-center rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-4 focus-visible:after:ring-inset focus-visible:after:ring-admin-red/45" aria-label={`${booking.contact.name}さんの予約詳細を開く`}>
                {booking.contact.name}
              </a>
            </h3>
            <span className="rounded-full bg-admin-green/10 px-2.5 py-1 text-[11px] font-extrabold text-admin-green">確認済み</span>
          </div>
          <p className="truncate text-xs font-bold text-admin-navy/65 sm:text-sm">{slot?.experience.name ?? '開催枠を確認してください'}</p>
          <p className="mt-1 text-[11px] font-semibold text-admin-navy/45">{booking.totalPeople}名 ・ 予約番号 {booking.code}</p>
        </div>
        <ChevronRight aria-hidden="true" className="size-5 text-admin-green transition-transform group-hover:translate-x-0.5" />
      </div>
    </article>
  );
}

function GuestList({ bookings, slots }: { bookings: Booking[]; slots: CalendarSlot[] }) {
  const slotMap = new Map(slots.map((slot) => [slot.id, slot]));
  const activeBookings = bookings.filter((booking) => booking.status === 'confirmed');
  return (
    <section aria-labelledby="guest-list-title">
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 id="guest-list-title" className="font-admin-sans text-xl font-black text-admin-navy sm:text-2xl">予約者一覧</h2>
        <p className="rounded-full bg-admin-bg-secondary px-3 py-2 text-xs font-extrabold text-admin-green">{activeBookings.length}件</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">{activeBookings.map((booking) => <BookingCard key={booking.id} booking={booking} slot={slotMap.get(booking.slotId)} />)}</div>
    </section>
  );
}

function TodayDashboard({ dashboard, bookings, slots, onAddBooking, onBulkCancellation }: { dashboard: DashboardSummary; bookings: Booking[]; slots: CalendarSlot[]; onAddBooking: () => void; onBulkCancellation: () => void }) {
  const focusSlotIds = new Set(dashboard.todaySlots.map((slot) => slot.id));
  const focusBookings = bookings.filter((booking) => booking.status === 'confirmed' && focusSlotIds.has(booking.slotId));
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
            className="pointer-events-auto inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-admin-green px-6 text-sm font-black text-white shadow-[0_14px_30px_rgba(67,110,79,0.3)] transition-colors hover:bg-admin-navy focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-red/45 sm:w-auto"
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
  const [activeTab, setActiveTab] = useState<AdminTabId>('today');
  const [phoneBookingOpen, setPhoneBookingOpen] = useState(false);
  const [bulkCancellationOpen, setBulkCancellationOpen] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [slots, setSlots] = useState<CalendarSlot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [notifications, setNotifications] = useState<NotificationJob[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const currentTab = ADMIN_TABS.find((tab) => tab.id === activeTab) ?? ADMIN_TABS[0];
  const ActiveIcon = currentTab.icon;
  const cancellationSlot = dashboard?.todaySlots.find((slot) => slot.manualStatus !== 'cancelled');

  async function load() {
    const [nextDashboard, nextSlots, nextBookings, nextWaitlist, nextNotifications, nextLogs] = await Promise.all([
      repository.getDashboard(),
      repository.listSlots(),
      repository.listBookings(),
      repository.listWaitlistEntries(),
      repository.listNotificationJobs(),
      repository.listAuditLogs(),
    ]);
    setDashboard(nextDashboard);
    setSlots(nextSlots);
    setBookings(nextBookings);
    setWaitlist(nextWaitlist);
    setNotifications(nextNotifications);
    setAuditLogs(nextLogs);
  }

  useEffect(() => {
    void load();
  }, [repository, revision]);

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

  if (!dashboard) return <div className="grid min-h-dvh place-items-center bg-admin-bg-primary font-admin-sans font-bold text-admin-green">管理画面を準備しています…</div>;

  return (
    <div className="min-h-dvh bg-admin-bg-primary font-admin-sans text-admin-navy antialiased">
      <a
        href="#admin-main"
        className="fixed left-3 top-3 z-[60] -translate-y-24 rounded-md bg-admin-navy px-4 py-3 text-sm font-bold text-white transition-transform focus-visible:translate-y-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-red/35"
      >
        メインコンテンツへ移動
      </a>

      <header className="fixed inset-x-0 top-0 z-50 border-b border-admin-green/20 bg-admin-bg-primary/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-admin-green text-white shadow-sm">
              <Leaf aria-hidden="true" className="size-5" strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold tracking-[0.08em] text-admin-navy sm:text-base">
                みのり日和ファーム
              </p>
              <p className="truncate text-[11px] font-semibold text-admin-green">運営管理</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <nav aria-label="グローバルナビゲーション">
              <button
                type="button"
                onClick={() => setActiveTab('today')}
                className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-xs font-extrabold text-admin-navy transition-colors hover:bg-admin-bg-secondary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-red/40"
              >
                <LayoutDashboard aria-hidden="true" className="size-4" />
                <span className="hidden md:inline">本日の運営</span>
              </button>
            </nav>
            <button
              type="button"
              onClick={handleDemoReset}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-xs font-extrabold text-admin-red transition-colors hover:bg-admin-red/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-admin-red/40"
              aria-label="デモデータを初期状態へ戻す"
              title="次の商談を同じ条件で開始できます"
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              <span className="hidden lg:inline">デモを初期化</span>
            </button>
            <span className="hidden items-center gap-2 rounded-full bg-admin-bg-secondary px-3 py-2 text-xs font-bold text-admin-green sm:inline-flex">
              <span className="size-2 rounded-full bg-admin-green" aria-hidden="true" />
              デモ環境
            </span>
            <div className="flex items-center gap-2" aria-label="ログイン中の利用者">
              <CircleUserRound aria-hidden="true" className="size-7 text-admin-navy/70" />
              <span className="hidden text-xs font-bold sm:inline">農園スタッフ</span>
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
            />
          ) : activeTab === 'guests' ? (
            <GuestList bookings={bookings} slots={slots} />
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
          <div role="tablist" aria-label="管理機能" className="flex min-w-max items-stretch sm:min-w-0">
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
                  className={`group relative flex min-h-20 min-w-[7.25rem] flex-1 flex-col items-center justify-center gap-1.5 px-3 text-xs font-extrabold transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-admin-red/45 sm:min-w-0 ${
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

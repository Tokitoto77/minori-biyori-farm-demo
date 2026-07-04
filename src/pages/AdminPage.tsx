import { FormEvent, useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { AlertTriangle, Bell, CalendarDays, CheckCircle2, ClipboardList, CloudOff, Copy, FileText, History, LayoutDashboard, PauseCircle, Pencil, PhoneCall, Plus, RefreshCw, RotateCcw, Settings2, Sprout, Trash2, UserRoundPlus, Users, XCircle } from 'lucide-react';
import { Button, DemoNotice, EmptyState, Modal, StatusBadge } from '../components/Common';
import { BrandLogo } from '../components/BrandLogo';
import { SlotEditor } from '../components/SlotEditor';
import type { Navigate } from '../components/Shell';
import { partyTotal, yen } from '../domain/rules';
import type { AuditLog, Booking, CalendarSlot, Contact, DashboardSummary, Experience, NotificationJob, Party, WaitlistEntry } from '../domain/types';
import type { AdminRepository } from '../repositories/contracts';

type Tab = 'overview' | 'slots' | 'bookings' | 'waitlist' | 'notifications' | 'logs';

export function AdminPage({ repository, navigate, revision, onChanged }: { repository: AdminRepository; navigate: Navigate; revision: number; onChanged: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [slots, setSlots] = useState<CalendarSlot[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [notifications, setNotifications] = useState<NotificationJob[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<CalendarSlot | null | undefined>(undefined);
  const [busy, setBusy] = useState('');

  async function load() {
    const [nextDashboard, nextExperiences, nextSlots, nextBookings, nextWaitlist, nextNotifications, nextLogs] = await Promise.all([
      repository.getDashboard(), repository.listExperiences(), repository.listSlots(), repository.listBookings(), repository.listWaitlistEntries(), repository.listNotificationJobs(), repository.listAuditLogs(),
    ]);
    setDashboard(nextDashboard); setExperiences(nextExperiences); setSlots(nextSlots); setBookings(nextBookings); setWaitlist(nextWaitlist); setNotifications(nextNotifications); setLogs(nextLogs);
  }

  useEffect(() => { load(); }, [repository, revision]);

  async function run(key: string, task: () => Promise<unknown>) {
    setBusy(key);
    try { await task(); onChanged(); await load(); return true; }
    catch (cause) { window.alert(cause instanceof Error ? cause.message : '操作を完了できませんでした。'); return false; }
    finally { setBusy(''); }
  }

  const slotMap = useMemo(() => new Map(slots.map((slot) => [slot.id, slot])), [slots]);
  const activeBookings = bookings.filter((booking) => booking.status === 'confirmed');
  const activeWaitlist = waitlist.filter((entry) => entry.status === 'waiting');

  const tabs: { id: Tab; label: string; icon: typeof LayoutDashboard; count?: number }[] = [
    { id: 'overview', label: '本日の運営', icon: LayoutDashboard },
    { id: 'slots', label: '開催枠', icon: CalendarDays },
    { id: 'bookings', label: '予約者', icon: Users, count: activeBookings.length },
    { id: 'waitlist', label: '待機者', icon: ClipboardList, count: activeWaitlist.length },
    { id: 'notifications', label: '通知', icon: Bell, count: notifications.filter((job) => job.status === 'failed').length },
    { id: 'logs', label: '操作履歴', icon: History },
  ];

  if (!dashboard) return <div className="page-loading">デモ管理画面を準備しています…</div>;

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar"><div><div className="admin-brand"><BrandLogo /><span><small>MINORI BIYORI FARM</small><strong>みのり日和ファーム</strong></span></div><span className="admin-badge">DEMO ADMIN</span><h1>農園運営室</h1><p>今日の畑と予約を、ひとつの帳面に。</p></div><nav aria-label="管理メニュー">{tabs.map(({ id, label, icon: Icon, count }) => <button type="button" key={id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}><Icon />{label}{Boolean(count) && <span>{count}</span>}</button>)}</nav><button className="public-return" type="button" onClick={() => navigate('/')}><Sprout />利用者画面へ戻る</button></aside>
      <div className="admin-content">
        <header className="admin-topbar"><div><span>{format(new Date(), 'yyyy年M月d日（E）', { locale: ja })}</span><strong>みのり日和ファーム 管理画面</strong></div><div className="admin-topbar-actions"><DemoNotice compact /><DemoReset repository={repository} onChanged={onChanged} /></div></header>
        {tab === 'overview' && <Overview dashboard={dashboard} notifications={notifications} slots={slots} setTab={setTab} onPhone={() => setPhoneOpen(true)} onPause={(slot) => run(`pause-${slot.id}`, () => repository.updateSlot(slot.id, { manualStatus: slot.manualStatus === 'paused' ? 'normal' : 'paused', statusReason: slot.manualStatus === 'paused' ? '' : '農園の判断で受付を一時停止しています。' }))} onCancel={(slot) => setCancelTarget(slot)} busy={busy} />}
        {tab === 'slots' && <SlotManagement slots={slots} experiences={experiences} bookings={bookings} waitlist={waitlist} repository={repository} run={run} busy={busy} onCancel={(slot) => setCancelTarget(slot)} onSaved={async () => { onChanged(); await load(); }} onViewPublic={() => navigate('/')} />}
        {tab === 'bookings' && <BookingList bookings={bookings} slotMap={slotMap} />}
        {tab === 'waitlist' && <WaitlistList entries={waitlist} slotMap={slotMap} onPromote={(entry) => run(`promote-${entry.id}`, () => repository.promoteWaitlist(entry.id))} busy={busy} />}
        {tab === 'notifications' && <NotificationList jobs={notifications} onRetry={(job) => run(`retry-${job.id}`, () => repository.retryNotification(job.id))} busy={busy} />}
        {tab === 'logs' && <AuditList logs={logs} />}
      </div>
      <div className="admin-mobile-actions"><button className="admin-mobile-public" type="button" onClick={() => navigate('/')} aria-label="利用者画面へ戻る"><Sprout />利用者画面</button><button type="button" onClick={() => setPhoneOpen(true)}><PhoneCall />電話予約</button><button type="button" onClick={() => setTab('slots')}><PauseCircle />開催枠</button><button type="button" onClick={() => setCancelTarget(null)}><CloudOff />開催中止</button></div>
      {phoneOpen && <PhoneBookingModal slots={slots.filter((slot) => slot.publicationStatus === 'published' && (slot.displayStatus === 'available' || slot.displayStatus === 'few'))} repository={repository} onClose={() => setPhoneOpen(false)} onDone={() => { setPhoneOpen(false); onChanged(); load(); }} />}
      {cancelTarget !== undefined && <CancelSlotModal initialSlot={cancelTarget} slots={slots.filter((slot) => slot.publicationStatus === 'published' && slot.manualStatus !== 'cancelled')} bookings={bookings} waitlist={waitlist} onClose={() => setCancelTarget(undefined)} onConfirm={async (slot, reason) => { const succeeded = await run(`cancel-${slot.id}`, () => repository.cancelSlot(slot.id, reason)); if (succeeded) setCancelTarget(undefined); }} busy={busy.startsWith('cancel-')} />}
    </div>
  );
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="admin-page-header"><div><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>{action}</div>;
}

function Overview({ dashboard, notifications, slots, setTab, onPhone, onPause, onCancel, busy }: { dashboard: DashboardSummary; notifications: NotificationJob[]; slots: CalendarSlot[]; setTab: (tab: Tab) => void; onPhone: () => void; onPause: (slot: CalendarSlot) => void; onCancel: (slot: CalendarSlot) => void; busy: string }) {
  const focusSlots = dashboard.todaySlots;
  return <section className="admin-page"><PageHeader eyebrow="TODAY'S FARM" title="本日の運営" description="まず見るべき数字と操作だけを集めています。" action={<Button onClick={onPhone}><UserRoundPlus />電話予約を登録</Button>} /><div className="metric-grid"><Metric icon={Users} label="予約人数" value={`${dashboard.confirmedPeople}名`} note="本日の対象枠" /><Metric icon={CheckCircle2} label="残席" value={`${dashboard.remainingSeats}席`} note="全開催枠の合計" /><Metric icon={ClipboardList} label="待機" value={`${dashboard.waitingGroups}組`} note="確認待ち" /><Metric icon={dashboard.failedNotifications ? AlertTriangle : Bell} label="通知失敗" value={`${dashboard.failedNotifications}件`} note={dashboard.failedNotifications ? '再送が必要です' : 'すべて正常'} warning={dashboard.failedNotifications > 0} onClick={() => setTab('notifications')} /></div><div className="admin-section-title"><div><span>本日または直近の開催</span><h3>開催枠の状況</h3></div><button type="button" onClick={() => setTab('slots')}>すべて見る</button></div><div className="operations-list">{focusSlots.map((slot) => <article key={slot.id}><div className="operation-date"><strong>{format(parseISO(slot.startAt), 'H:mm')}</strong><span>{format(parseISO(slot.startAt), 'M/d（E）', { locale: ja })}</span></div><div className="operation-main"><StatusBadge status={slot.displayStatus} /><h4>{slot.experience.name}</h4><p>{slot.bookedPeople}名予約 / 定員{slot.capacity}名　<span>残り{slot.remaining}席</span></p><div className="occupancy"><i style={{ width: `${Math.min(100, slot.bookedPeople / slot.capacity * 100)}%` }} /></div></div><div className="operation-actions"><Button variant="secondary" onClick={() => onPause(slot)} disabled={slot.manualStatus === 'cancelled' || busy === `pause-${slot.id}`}><PauseCircle />{slot.manualStatus === 'paused' ? '受付再開' : '受付停止'}</Button><Button variant="danger" onClick={() => onCancel(slot)} disabled={slot.manualStatus === 'cancelled' || busy === `cancel-${slot.id}`}><CloudOff />開催中止</Button></div></article>)}</div>{notifications.some((job) => job.status === 'failed') && <button className="notification-alert" type="button" onClick={() => setTab('notifications')}><AlertTriangle /><span><strong>送信できなかった通知があります</strong>内容を確認して再送してください。</span><span>{notifications.filter((job) => job.status === 'failed').length}件</span></button>}</section>;
}

function Metric({ icon: Icon, label, value, note, warning, onClick }: { icon: typeof Users; label: string; value: string; note: string; warning?: boolean; onClick?: () => void }) {
  const Element = onClick ? 'button' : 'div';
  return <Element className={`metric-card ${warning ? 'metric-card--warning' : ''}`} onClick={onClick}><span><Icon /></span><div><small>{label}</small><strong>{value}</strong><p>{note}</p></div></Element>;
}

function SlotManagement({ slots, experiences, bookings, waitlist, repository, run, busy, onCancel, onSaved, onViewPublic }: { slots: CalendarSlot[]; experiences: Experience[]; bookings: Booking[]; waitlist: WaitlistEntry[]; repository: AdminRepository; run: (key: string, task: () => Promise<unknown>) => void; busy: string; onCancel: (slot: CalendarSlot) => void; onSaved: () => Promise<void>; onViewPublic: () => void }) {
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit' | 'duplicate'; slot?: CalendarSlot } | null>(null);
  const historyIds = useMemo(() => new Set([...bookings.map((booking) => booking.slotId), ...waitlist.map((entry) => entry.slotId)]), [bookings, waitlist]);

  async function remove(slot: CalendarSlot) {
    if (historyIds.has(slot.id)) {
      window.alert('予約・待機履歴があるため削除できません。必要な場合は「開催中止」を使ってください。');
      return;
    }
    if (!window.confirm(`${format(parseISO(slot.startAt), 'M月d日 H:mm')} ${slot.experience.name}を削除しますか？`)) return;
    try {
      await repository.deleteSlot(slot.id);
      await onSaved();
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : '削除できませんでした。');
    }
  }

  return <section className="admin-page"><PageHeader eyebrow="SCHEDULE" title="開催枠の管理" description="作成から公開、予約受付後の運営までを開催枠ごとに管理します。" action={<Button onClick={() => setEditor({ mode: 'create' })}><Plus />開催枠を作成</Button>} /><div className="management-list">{slots.map((slot) => {
    const hasHistory = historyIds.has(slot.id);
    return <article key={slot.id} className={slot.publicationStatus === 'draft' ? 'is-draft' : ''}><div className="management-date"><strong>{format(parseISO(slot.startAt), 'd')}</strong><span>{format(parseISO(slot.startAt), 'M月（E）', { locale: ja })}<br />{format(parseISO(slot.startAt), 'H:mm')}</span></div><div className="management-main"><div className="management-badges"><StatusBadge status={slot.displayStatus} /><span className={`publication-badge publication-badge--${slot.publicationStatus}`}>{slot.publicationStatus === 'published' ? '公開中' : <><FileText />下書き</>}</span></div><h3>{slot.experience.name}</h3><p>定員 {slot.capacity}名 ・ 予約 {slot.bookedPeople}名 ・ 残り {slot.remaining}席</p>{hasHistory && <small>予約・待機履歴あり</small>}</div><div className="capacity-control"><span>定員</span><button type="button" aria-label="定員を1人減らす" disabled={slot.capacity <= slot.bookedPeople || busy === `capacity-${slot.id}`} onClick={() => run(`capacity-${slot.id}`, () => repository.updateSlot(slot.id, { capacity: Math.max(slot.bookedPeople, slot.capacity - 1) }))}>−</button><strong>{slot.capacity}</strong><button type="button" aria-label="定員を1人増やす" disabled={slot.capacity >= 100 || busy === `capacity-${slot.id}`} onClick={() => run(`capacity-${slot.id}`, () => repository.updateSlot(slot.id, { capacity: slot.capacity + 1 }))}>＋</button></div><div className="management-actions management-actions--primary"><Button variant="secondary" onClick={() => setEditor({ mode: 'edit', slot })}><Pencil />編集</Button><Button variant="ghost" onClick={() => setEditor({ mode: 'duplicate', slot })}><Copy />複製</Button><Button variant="ghost" className="delete-slot-button" disabled={hasHistory} title={hasHistory ? '予約・待機履歴がある枠は削除できません' : 'この開催枠を削除'} onClick={() => remove(slot)}><Trash2 />削除</Button></div><div className="management-actions management-actions--operations"><Button variant="secondary" disabled={slot.manualStatus === 'cancelled'} onClick={() => run(`pause-${slot.id}`, () => repository.updateSlot(slot.id, { manualStatus: slot.manualStatus === 'paused' ? 'normal' : 'paused', statusReason: slot.manualStatus === 'paused' ? '' : '農園の判断で受付を一時停止しています。' }))}><Settings2 />{slot.manualStatus === 'paused' ? '再開' : '停止'}</Button><Button variant="danger" disabled={slot.manualStatus === 'cancelled'} onClick={() => onCancel(slot)}><CloudOff />中止</Button></div></article>;
  })}</div>{editor && <SlotEditor mode={editor.mode} sourceSlot={editor.slot} hasHistory={editor.slot ? historyIds.has(editor.slot.id) : false} repository={repository} experiences={experiences} slots={slots} onClose={() => setEditor(null)} onSaved={onSaved} onViewPublic={onViewPublic} />}</section>;
}

function BookingList({ bookings, slotMap }: { bookings: Booking[]; slotMap: Map<string, CalendarSlot> }) {
  return <section className="admin-page"><PageHeader eyebrow="BOOKINGS" title="予約者一覧" description="デモでは代表者情報を固定値に置き換えて表示します。" /><div className="data-cards">{bookings.length ? bookings.map((booking) => { const slot = slotMap.get(booking.slotId); return <article key={booking.id}><header><span className={`record-status record-status--${booking.status}`}>{booking.status === 'confirmed' ? '予約確定' : booking.status === 'canceledByGuest' ? '利用者キャンセル' : '開催中止'}</span><small>{booking.source === 'phone' ? '電話受付' : booking.source === 'waitlist' ? '待機繰り上げ' : 'Web受付'}</small></header><h3>{booking.contact.name}<span>{booking.totalPeople}名</span></h3><p>{booking.contact.phone}　{booking.contact.email}</p><dl><div><dt>体験</dt><dd>{slot?.experience.name ?? '—'}</dd></div><div><dt>日時</dt><dd>{slot ? format(parseISO(slot.startAt), 'M月d日（E） H:mm', { locale: ja }) : '—'}</dd></div><div><dt>料金</dt><dd>{yen(booking.totalPrice)}</dd></div><div><dt>予約番号</dt><dd>{booking.code}</dd></div></dl></article>; }) : <EmptyState title="予約はありません">利用者画面または電話予約から登録すると、ここへ反映されます。</EmptyState>}</div></section>;
}

function WaitlistList({ entries, slotMap, onPromote, busy }: { entries: WaitlistEntry[]; slotMap: Map<string, CalendarSlot>; onPromote: (entry: WaitlistEntry) => void; busy: string }) {
  return <section className="admin-page"><PageHeader eyebrow="WAITLIST" title="キャンセル待ち" description="残席に収まるグループだけを、確認して繰り上げます。" /><div className="data-cards">{entries.length ? entries.map((entry) => { const slot = slotMap.get(entry.slotId); const canPromote = entry.status === 'waiting' && Boolean(slot && slot.remaining >= entry.totalPeople); return <article key={entry.id}><header><span className={`record-status record-status--${entry.status}`}>{entry.status === 'waiting' ? `待ち順 ${entry.queueNumber}` : entry.status === 'promoted' ? '繰り上げ済み' : '開催中止'}</span><small>{entry.code}</small></header><h3>{entry.contact.name}<span>{entry.totalPeople}名</span></h3><p>{slot?.experience.name}　{slot ? format(parseISO(slot.startAt), 'M月d日 H:mm') : ''}</p><div className="promotion-check"><span>現在の残席<strong>{slot?.remaining ?? 0}席</strong></span><span>このグループ<strong>{entry.totalPeople}名</strong></span></div>{entry.status === 'waiting' && <Button disabled={!canPromote || busy === `promote-${entry.id}`} onClick={() => onPromote(entry)}>{canPromote ? '予約へ繰り上げる' : '残席不足のため繰り上げ不可'}</Button>}</article>; }) : <EmptyState title="待機中のグループはありません">満員枠へキャンセル待ちが入ると表示されます。</EmptyState>}</div></section>;
}

function NotificationList({ jobs, onRetry, busy }: { jobs: NotificationJob[]; onRetry: (job: NotificationJob) => void; busy: string }) {
  return <section className="admin-page"><PageHeader eyebrow="NOTIFICATIONS" title="通知履歴" description="販売デモではメールを送らず、内容と送信状態だけを再現します。" /><div className="notification-list">{jobs.map((job) => <article key={job.id} className={job.status === 'failed' ? 'is-failed' : ''}><span className="notification-icon">{job.status === 'sent' ? <CheckCircle2 /> : <XCircle />}</span><div><header><strong>{job.subject}</strong><span>{job.status === 'sent' ? '送信済み（デモ）' : '送信失敗サンプル'}</span></header><p>{job.preview}</p><small>{job.recipientName} &lt;{job.recipientEmail}&gt;　試行 {job.attempts}回</small></div>{job.status === 'failed' && <Button variant="secondary" disabled={busy === `retry-${job.id}`} onClick={() => onRetry(job)}><RefreshCw />再送する</Button>}</article>)}</div></section>;
}

function AuditList({ logs }: { logs: AuditLog[] }) {
  return <section className="admin-page"><PageHeader eyebrow="AUDIT LOG" title="操作履歴" description="誰が、いつ、何を変更したかを確認できます。" /><ol className="audit-list">{logs.map((log) => <li key={log.id}><span><History /></span><div><strong>{log.summary}</strong><p>{log.action} ・ {log.actor === 'demoAdmin' ? 'デモ管理者' : log.actor === 'guest' ? '利用者' : 'システム'}</p></div><time>{format(parseISO(log.createdAt), 'M/d H:mm')}</time></li>)}</ol></section>;
}

function PhoneBookingModal({ slots, repository, onClose, onDone }: { slots: CalendarSlot[]; repository: AdminRepository; onClose: () => void; onDone: () => void }) {
  const [slotId, setSlotId] = useState(slots[0]?.id ?? '');
  const [party, setParty] = useState<Party>({ adults: 2, children: 0, infants: 0 });
  const [contact, setContact] = useState<Contact>({ name: 'デモ利用者', phone: '000-0000-0000', email: 'demo@example.invalid', note: '' });
  const [phoneOnly, setPhoneOnly] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const selectedSlot = slots.find((slot) => slot.id === slotId);
  const total = partyTotal(party);
  const notificationNeedsEmail = !phoneOnly && !contact.email.trim();
  function changeParty(key: keyof Party, delta: number) {
    const nextValue = Math.max(0, Math.min(10, party[key] + delta));
    const next = { ...party, [key]: nextValue };
    if (partyTotal(next) <= 10) setParty(next);
  }
  async function submit(event: FormEvent) { event.preventDefault(); if (notificationNeedsEmail) return; setSubmitting(true); try { await repository.createPhoneBooking({ slotId, party, contact: { ...contact, name: contact.name.trim(), phone: contact.phone.trim(), email: contact.email.trim(), note: contact.note?.trim() }, sendNotification: !phoneOnly }); onDone(); } catch (cause) { window.alert(cause instanceof Error ? cause.message : '登録できませんでした。'); setSubmitting(false); } }
  return <Modal title="電話予約を登録" onClose={onClose} className="phone-booking-modal"><form className="phone-form" onSubmit={submit}><p className="phone-demo-note"><AlertTriangle />入力内容は保存せず、登録時に固定ダミー値へ置き換えます。</p><label><span>開催枠</span><select value={slotId} onChange={(event) => setSlotId(event.target.value)} required>{slots.map((slot) => <option value={slot.id} key={slot.id}>{format(parseISO(slot.startAt), 'M/d（E）H:mm', { locale: ja })} {slot.experience.name}</option>)}</select></label><fieldset className="phone-party"><legend>人数</legend>{([['adults', '大人'], ['children', '子ども'], ['infants', '幼児']] as const).map(([key, label]) => <div className="phone-party-row" key={key}><span>{label}</span><button type="button" aria-label={`${label}を1人減らす`} disabled={party[key] === 0} onClick={() => changeParty(key, -1)}>−</button><strong>{party[key]}</strong><button type="button" aria-label={`${label}を1人増やす`} disabled={total >= Math.min(10, selectedSlot?.remaining ?? 10)} onClick={() => changeParty(key, 1)}>＋</button></div>)}</fieldset><div className="phone-party-total"><span>合計</span><strong>{total}名</strong><small>残席 {selectedSlot?.remaining ?? 0}名</small></div><div className="phone-contact-grid"><label><span>代表者名 <small>必須</small></span><input value={contact.name} maxLength={40} onChange={(event) => setContact({ ...contact, name: event.target.value })} required /></label><label><span>電話番号 <small>必須</small></span><input type="tel" inputMode="tel" value={contact.phone} maxLength={24} onChange={(event) => setContact({ ...contact, phone: event.target.value })} required /></label></div><label className="phone-only-row"><input type="checkbox" checked={phoneOnly} onChange={(event) => setPhoneOnly(event.target.checked)} /><span><strong>電話連絡のみ</strong><small>メール通知プレビューを作成しません</small></span></label><details className="phone-optional"><summary>メール・備考を追加</summary><div><label><span>メールアドレス <small>任意</small></span><input type="email" value={contact.email} maxLength={120} onChange={(event) => setContact({ ...contact, email: event.target.value })} /></label><label><span>備考 <small>任意</small></span><textarea value={contact.note} maxLength={200} rows={3} onChange={(event) => setContact({ ...contact, note: event.target.value })} placeholder="例：折り返し連絡を希望" /></label></div></details>{notificationNeedsEmail && <p className="form-error">メール通知を作成する場合はメールアドレスを入力してください。</p>}<Button className="phone-submit" type="submit" disabled={!slotId || total < 1 || total > (selectedSlot?.remaining ?? 0) || !contact.name.trim() || !contact.phone.trim() || notificationNeedsEmail || submitting}>{submitting ? '登録中…' : '登録する'}</Button></form></Modal>;
}

function CancelSlotModal({ initialSlot, slots, bookings, waitlist, onClose, onConfirm, busy }: { initialSlot: CalendarSlot | null; slots: CalendarSlot[]; bookings: Booking[]; waitlist: WaitlistEntry[]; onClose: () => void; onConfirm: (slot: CalendarSlot, reason: string) => Promise<void>; busy: boolean }) {
  const [slotId, setSlotId] = useState(initialSlot?.id ?? slots[0]?.id ?? '');
  const [reason, setReason] = useState('生育・天候状況により開催を中止します。');
  const slot = slots.find((item) => item.id === slotId);
  const affectedBookings = bookings.filter((booking) => booking.slotId === slotId && booking.status === 'confirmed');
  const affectedWaitlist = waitlist.filter((entry) => entry.slotId === slotId && entry.status === 'waiting');
  return <Modal title="開催中止を登録" onClose={onClose} className="cancel-slot-modal"><form className="cancel-slot-form" onSubmit={async (event) => { event.preventDefault(); if (slot && reason.trim()) await onConfirm(slot, reason.trim()); }}><div className="cancel-slot-alert"><CloudOff /><div><strong>この操作は対象者の状態を一括変更します</strong><p>予約者と待機者を開催中止へ変更し、通知プレビューと操作履歴を作成します。</p></div></div><label><span>対象の開催枠</span><select value={slotId} onChange={(event) => setSlotId(event.target.value)} required>{slots.map((item) => <option value={item.id} key={item.id}>{format(parseISO(item.startAt), 'M/d（E）H:mm', { locale: ja })} {item.experience.name}</option>)}</select></label>{slot && <div className="cancel-impact"><div><span>体験</span><strong>{slot.experience.name}</strong></div><div><span>日時</span><strong>{format(parseISO(slot.startAt), 'M月d日（E）H:mm', { locale: ja })}</strong></div><div><span>予約者</span><strong>{affectedBookings.reduce((sum, booking) => sum + booking.totalPeople, 0)}名</strong></div><div><span>待機者</span><strong>{affectedWaitlist.reduce((sum, entry) => sum + entry.totalPeople, 0)}名</strong></div></div>}<label><span>中止理由 <small>必須</small></span><textarea value={reason} maxLength={200} rows={4} onChange={(event) => setReason(event.target.value)} required /></label><div className="modal-actions"><Button variant="secondary" type="button" onClick={onClose}>中止しない</Button><Button variant="danger" type="submit" disabled={!slot || !reason.trim() || busy}>{busy ? '処理中…' : '開催中止を確定'}</Button></div></form></Modal>;
}

export function DemoReset({ repository, onChanged }: { repository: AdminRepository; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  return <><Button variant="ghost" onClick={() => setOpen(true)}><RotateCcw /><span className="reset-label">初期データへ戻す</span><span className="reset-label--mobile">初期化</span></Button>{open && <Modal title="デモデータを初期状態へ戻しますか？" onClose={() => setOpen(false)}><div className="confirm-modal"><p>予約、待機、開催枠、通知、操作履歴を最初のサンプル状態へ戻します。この操作は取り消せません。</p><div className="modal-actions"><Button variant="secondary" onClick={() => setOpen(false)}>戻さない</Button><Button variant="danger" onClick={async () => { await repository.resetDemo(); setOpen(false); onChanged(); }}>初期状態へ戻す</Button></div></div></Modal>}</>;
}

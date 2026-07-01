import { FormEvent, useMemo, useState } from 'react';
import { addDays, format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { CalendarCheck, Check, ChevronLeft, ChevronRight, Eye, FileText, Layers3 } from 'lucide-react';
import { assertSlotInput, buildWeeklyDates, yen } from '../domain/rules';
import type { CalendarSlot, Experience, PublicationStatus, Slot, SlotCreateInput, SlotUpdateInput } from '../domain/types';
import type { AdminRepository } from '../repositories/contracts';
import { Button, Modal } from './Common';

type EditorMode = 'create' | 'edit' | 'duplicate';

interface SlotEditorProps {
  mode: EditorMode;
  repository: AdminRepository;
  experiences: Experience[];
  slots: CalendarSlot[];
  sourceSlot?: CalendarSlot;
  hasHistory?: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onViewPublic: () => void;
}

interface EditorForm {
  experienceId: string;
  recurrence: 'single' | 'weekly';
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  capacity: number;
  prices: { adult: number; child: number; infant: number };
  bookingOpenAt: string;
  bookingCloseAt: string;
  cancellationDeadline: string;
  fewThreshold: number;
  note: string;
  publicationStatus: PublicationStatus;
}

function localDateTime(date: Date): string {
  return Number.isNaN(date.getTime()) ? '' : format(date, "yyyy-MM-dd'T'HH:mm");
}

function localDate(date: Date): string {
  return Number.isNaN(date.getTime()) ? '' : format(date, 'yyyy-MM-dd');
}

function localTime(date: Date): string {
  return Number.isNaN(date.getTime()) ? '' : format(date, 'HH:mm');
}

function fromLocal(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

function shiftDateTime(value: string, milliseconds: number): string {
  return new Date(new Date(value).getTime() + milliseconds).toISOString();
}

function nearestTemplate(slots: CalendarSlot[], experienceId: string): CalendarSlot | undefined {
  const now = Date.now();
  return slots
    .filter((slot) => slot.experienceId === experienceId)
    .sort((a, b) => Math.abs(new Date(a.startAt).getTime() - now) - Math.abs(new Date(b.startAt).getTime() - now))[0];
}

function makeInitialForm(mode: EditorMode, experiences: Experience[], slots: CalendarSlot[], sourceSlot?: CalendarSlot): EditorForm {
  const experienceId = sourceSlot?.experienceId ?? experiences[0]?.id ?? '';
  const template = sourceSlot ?? nearestTemplate(slots, experienceId);
  const experience = experiences.find((item) => item.id === experienceId);
  const fallbackStart = new Date();
  fallbackStart.setDate(fallbackStart.getDate() + 1);
  fallbackStart.setHours(9, 30, 0, 0);
  const sourceStart = template ? new Date(template.startAt) : fallbackStart;
  const sourceEnd = template ? new Date(template.endAt) : new Date(sourceStart.getTime() + (experience?.durationMinutes ?? 60) * 60_000);
  const start = mode === 'edit' ? sourceStart : fallbackStart;
  const end = mode === 'edit'
    ? sourceEnd
    : new Date(start.getTime() + (sourceEnd.getTime() - sourceStart.getTime()));
  const date = mode === 'duplicate' ? '' : localDate(start);
  const startDelta = start.getTime() - sourceStart.getTime();
  const bookingOpen = template ? new Date(new Date(template.bookingOpenAt).getTime() + startDelta) : addDays(start, -45);
  const bookingClose = template ? new Date(new Date(template.bookingCloseAt).getTime() + startDelta) : new Date(start.getTime() - 2 * 60 * 60_000);
  const cancellation = template ? new Date(new Date(template.cancellationDeadline).getTime() + startDelta) : new Date(start.getTime() - 3 * 60 * 60_000);

  return {
    experienceId,
    recurrence: 'single',
    date,
    endDate: date,
    startTime: localTime(start),
    endTime: localTime(end),
    capacity: template?.capacity ?? 12,
    prices: { ...(template?.prices ?? { adult: 2000, child: 1200, infant: 0 }) },
    bookingOpenAt: mode === 'duplicate' ? '' : localDateTime(bookingOpen),
    bookingCloseAt: mode === 'duplicate' ? '' : localDateTime(bookingClose),
    cancellationDeadline: mode === 'duplicate' ? '' : localDateTime(cancellation),
    fewThreshold: template?.fewThreshold ?? 3,
    note: template?.note ?? '',
    publicationStatus: mode === 'edit' ? sourceSlot?.publicationStatus ?? 'draft' : 'draft',
  };
}

export function SlotEditor({ mode, repository, experiences, slots, sourceSlot, hasHistory = false, onClose, onSaved, onViewPublic }: SlotEditorProps) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<EditorForm>(() => makeInitialForm(mode, experiences, slots, sourceSlot));
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState<{ count: number; publicationStatus: PublicationStatus } | null>(null);
  const identityLocked = mode === 'edit' && hasHistory;

  function updateDate(value: string) {
    const oldStart = form.date ? fromLocal(form.date, form.startTime) : null;
    const nextStart = value ? fromLocal(value, form.startTime) : null;
    const delta = oldStart && nextStart ? nextStart.getTime() - oldStart.getTime() : 0;
    const shiftLocal = (current: string) => current && delta ? localDateTime(new Date(new Date(current).getTime() + delta)) : current;
    const next: EditorForm = {
      ...form,
      date: value,
      endDate: form.recurrence === 'single' || !form.endDate ? value : form.endDate,
      bookingOpenAt: shiftLocal(form.bookingOpenAt),
      bookingCloseAt: shiftLocal(form.bookingCloseAt),
      cancellationDeadline: shiftLocal(form.cancellationDeadline),
    };
    if (!oldStart && nextStart) {
      const template = sourceSlot ?? nearestTemplate(slots, form.experienceId);
      const templateStart = template ? new Date(template.startAt) : nextStart;
      const offset = nextStart.getTime() - templateStart.getTime();
      next.bookingOpenAt = localDateTime(template ? new Date(new Date(template.bookingOpenAt).getTime() + offset) : addDays(nextStart, -45));
      next.bookingCloseAt = localDateTime(template ? new Date(new Date(template.bookingCloseAt).getTime() + offset) : new Date(nextStart.getTime() - 2 * 60 * 60_000));
      next.cancellationDeadline = localDateTime(template ? new Date(new Date(template.cancellationDeadline).getTime() + offset) : new Date(nextStart.getTime() - 3 * 60 * 60_000));
    }
    setForm(next);
  }

  function updateExperience(experienceId: string) {
    const template = nearestTemplate(slots, experienceId);
    const experience = experiences.find((item) => item.id === experienceId);
    const start = form.date ? fromLocal(form.date, form.startTime) : null;
    const duration = template
      ? new Date(template.endAt).getTime() - new Date(template.startAt).getTime()
      : (experience?.durationMinutes ?? 60) * 60_000;
    const offset = start && template ? start.getTime() - new Date(template.startAt).getTime() : 0;
    setForm({
      ...form,
      experienceId,
      endTime: start ? localTime(new Date(start.getTime() + duration)) : form.endTime,
      capacity: template?.capacity ?? form.capacity,
      prices: { ...(template?.prices ?? form.prices) },
      fewThreshold: template?.fewThreshold ?? form.fewThreshold,
      note: template?.note ?? form.note,
      bookingOpenAt: start && template ? localDateTime(new Date(new Date(template.bookingOpenAt).getTime() + offset)) : form.bookingOpenAt,
      bookingCloseAt: start && template ? localDateTime(new Date(new Date(template.bookingCloseAt).getTime() + offset)) : form.bookingCloseAt,
      cancellationDeadline: start && template ? localDateTime(new Date(new Date(template.cancellationDeadline).getTime() + offset)) : form.cancellationDeadline,
    });
  }

  function buildInputs(): SlotCreateInput[] {
    if (!form.date || !form.startTime || !form.endTime) throw new Error('開催日と開始・終了時刻を入力してください。');
    const firstStart = fromLocal(form.date, form.startTime);
    const firstEnd = fromLocal(form.date, form.endTime);
    const dates = form.recurrence === 'weekly' && mode !== 'edit'
      ? buildWeeklyDates(firstStart, fromLocal(form.endDate, form.startTime))
      : [firstStart];
    const duration = firstEnd.getTime() - firstStart.getTime();
    const baseBookingOpen = new Date(form.bookingOpenAt);
    const baseBookingClose = new Date(form.bookingCloseAt);
    const baseCancellation = new Date(form.cancellationDeadline);

    return dates.map((start) => {
      const shift = start.getTime() - firstStart.getTime();
      const input: SlotCreateInput = {
        experienceId: form.experienceId,
        startAt: start.toISOString(),
        endAt: new Date(start.getTime() + duration).toISOString(),
        capacity: form.capacity,
        prices: { ...form.prices },
        bookingOpenAt: new Date(baseBookingOpen.getTime() + shift).toISOString(),
        bookingCloseAt: new Date(baseBookingClose.getTime() + shift).toISOString(),
        cancellationDeadline: new Date(baseCancellation.getTime() + shift).toISOString(),
        fewThreshold: form.fewThreshold,
        publicationStatus: form.publicationStatus,
        manualStatus: mode === 'edit' ? sourceSlot?.manualStatus ?? 'normal' : 'normal',
        statusReason: mode === 'edit' ? sourceSlot?.statusReason : undefined,
        note: form.note,
      };
      assertSlotInput(input);
      return input;
    });
  }

  const preview = useMemo(() => {
    try { return buildInputs(); } catch { return []; }
  }, [form]);

  function nextStep() {
    setError('');
    try {
      if (step === 1) {
        if (!form.experienceId || !form.date || !form.startTime || !form.endTime) throw new Error('体験プランと開催日時を入力してください。');
        if (form.recurrence === 'weekly' && !form.endDate) throw new Error('毎週作成の終了日を入力してください。');
        buildInputs();
      }
      if (step === 2) buildInputs();
      setStep(Math.min(3, step + 1));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '入力内容を確認してください。');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const inputs = buildInputs();
      if (mode === 'edit' && sourceSlot) {
        let update: SlotUpdateInput = inputs[0];
        if (hasHistory) {
          update = {
            capacity: inputs[0].capacity,
            prices: inputs[0].prices,
            bookingOpenAt: inputs[0].bookingOpenAt,
            bookingCloseAt: inputs[0].bookingCloseAt,
            cancellationDeadline: inputs[0].cancellationDeadline,
            fewThreshold: inputs[0].fewThreshold,
            note: inputs[0].note,
          };
        }
        await repository.updateSlot(sourceSlot.id, update);
      } else {
        await repository.createSlots(inputs);
      }
      await onSaved();
      setSaved({ count: inputs.length, publicationStatus: inputs[0].publicationStatus });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存できませんでした。入力内容は保持されています。');
    } finally {
      setSubmitting(false);
    }
  }

  if (saved) {
    return <Modal title="開催枠を保存しました" onClose={onClose} className="slot-editor-modal"><div className="slot-editor-complete"><span><CalendarCheck /></span><h3>{saved.count}件の開催枠を保存しました</h3><p>{saved.publicationStatus === 'published' ? '利用者カレンダーへすぐに反映されています。' : '下書きとして保存しました。利用者画面にはまだ表示されません。'}</p><div className="modal-actions">{saved.publicationStatus === 'published' ? <Button onClick={onViewPublic}><Eye />利用者画面で確認</Button> : <Button onClick={onClose}><FileText />編集を続ける</Button>}</div></div></Modal>;
  }

  const title = mode === 'edit' ? '開催枠を編集' : mode === 'duplicate' ? '開催枠を複製' : '開催枠を作成';
  return <Modal title={title} onClose={onClose} className="slot-editor-modal"><form className="slot-editor" onSubmit={submit}>
    <ol className="slot-editor-steps" aria-label="開催枠作成の進行状況">{['開催日時', '料金・受付', '確認・公開'].map((label, index) => <li key={label} className={step >= index + 1 ? 'is-active' : ''}><span>{step > index + 1 ? <Check /> : index + 1}</span>{label}</li>)}</ol>
    {identityLocked && <div className="slot-editor-lock">予約・待機履歴があるため、体験と開催日時、公開状態は変更できません。</div>}
    {error && <div className="slot-editor-error" role="alert">{error}</div>}

    {step === 1 && <section className="slot-editor-panel"><div className="slot-editor-heading"><Layers3 /><div><h3>何を、いつ開催しますか？</h3><p>同じ体験の直近設定を初期値にしています。</p></div></div><div className="editor-grid">
      <label className="editor-field editor-field--wide"><span>体験プラン</span><select value={form.experienceId} disabled={identityLocked} onChange={(event) => updateExperience(event.target.value)}>{experiences.map((experience) => <option key={experience.id} value={experience.id}>{experience.name}</option>)}</select></label>
      {mode !== 'edit' && <fieldset className="editor-choice editor-field--wide"><legend>作成方法</legend><label><input type="radio" name="recurrence" checked={form.recurrence === 'single'} onChange={() => setForm({ ...form, recurrence: 'single', endDate: form.date })} />単日</label><label><input type="radio" name="recurrence" checked={form.recurrence === 'weekly'} onChange={() => setForm({ ...form, recurrence: 'weekly' })} />毎週（最大12枠）</label></fieldset>}
      <label className="editor-field"><span>開催日</span><input type="date" min={format(new Date(), 'yyyy-MM-dd')} value={form.date} disabled={identityLocked} onChange={(event) => updateDate(event.target.value)} required /></label>
      {form.recurrence === 'weekly' && mode !== 'edit' && <label className="editor-field"><span>終了日</span><input type="date" min={form.date} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} required /></label>}
      <label className="editor-field"><span>開始時刻</span><input type="time" value={form.startTime} disabled={identityLocked} onChange={(event) => setForm({ ...form, startTime: event.target.value })} required /></label>
      <label className="editor-field"><span>終了時刻</span><input type="time" value={form.endTime} disabled={identityLocked} onChange={(event) => setForm({ ...form, endTime: event.target.value })} required /></label>
    </div></section>}

    {step === 2 && <section className="slot-editor-panel"><div className="slot-editor-heading"><FileText /><div><h3>定員・料金・受付条件</h3><p>農園の運用ルールを開催枠へ設定します。</p></div></div><div className="editor-grid">
      <label className="editor-field"><span>定員</span><input type="number" min="1" max="100" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: Number(event.target.value) })} required /><small>1〜100人</small></label>
      <label className="editor-field"><span>残りわずか基準</span><input type="number" min="1" max={form.capacity} value={form.fewThreshold} onChange={(event) => setForm({ ...form, fewThreshold: Number(event.target.value) })} required /></label>
      <label className="editor-field"><span>大人料金</span><input type="number" min="0" step="1" value={form.prices.adult} onChange={(event) => setForm({ ...form, prices: { ...form.prices, adult: Number(event.target.value) } })} required /></label>
      <label className="editor-field"><span>子ども料金</span><input type="number" min="0" step="1" value={form.prices.child} onChange={(event) => setForm({ ...form, prices: { ...form.prices, child: Number(event.target.value) } })} required /></label>
      <label className="editor-field"><span>幼児料金</span><input type="number" min="0" step="1" value={form.prices.infant} onChange={(event) => setForm({ ...form, prices: { ...form.prices, infant: Number(event.target.value) } })} required /></label>
      <label className="editor-field"><span>受付開始</span><input type="datetime-local" value={form.bookingOpenAt} onChange={(event) => setForm({ ...form, bookingOpenAt: event.target.value })} required /></label>
      <label className="editor-field"><span>受付終了</span><input type="datetime-local" value={form.bookingCloseAt} onChange={(event) => setForm({ ...form, bookingCloseAt: event.target.value })} required /></label>
      <label className="editor-field"><span>キャンセル期限</span><input type="datetime-local" value={form.cancellationDeadline} onChange={(event) => setForm({ ...form, cancellationDeadline: event.target.value })} required /></label>
      <label className="editor-field editor-field--wide"><span>備考</span><textarea rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
    </div></section>}

    {step === 3 && <section className="slot-editor-panel"><div className="slot-editor-heading"><CalendarCheck /><div><h3>内容を確認して保存</h3><p>{preview.length}件の開催枠を作成します。</p></div></div><div className="slot-preview"><div><span>体験</span><strong>{experiences.find((item) => item.id === form.experienceId)?.name}</strong></div><div><span>開催</span><strong>{form.recurrence === 'weekly' && mode !== 'edit' ? `${form.date}〜${form.endDate} 毎週` : form.date}　{form.startTime}〜{form.endTime}</strong></div><div><span>定員</span><strong>{form.capacity}名（残り{form.fewThreshold}名で「残りわずか」）</strong></div><div><span>料金</span><strong>大人 {yen(form.prices.adult)} / 子ども {yen(form.prices.child)} / 幼児 {yen(form.prices.infant)}</strong></div></div><fieldset className="publication-choice"><legend>保存方法</legend><label className={form.publicationStatus === 'draft' ? 'is-selected' : ''}><input type="radio" name="publication" value="draft" checked={form.publicationStatus === 'draft'} disabled={identityLocked} onChange={() => setForm({ ...form, publicationStatus: 'draft' })} /><FileText /><span><strong>下書き保存</strong><small>管理画面だけに表示</small></span></label><label className={form.publicationStatus === 'published' ? 'is-selected' : ''}><input type="radio" name="publication" value="published" checked={form.publicationStatus === 'published'} onChange={() => setForm({ ...form, publicationStatus: 'published' })} /><Eye /><span><strong>公開する</strong><small>利用者カレンダーへ即時反映</small></span></label></fieldset></section>}

    <div className="slot-editor-actions"><Button variant="secondary" type="button" onClick={step === 1 ? onClose : () => { setError(''); setStep(step - 1); }}>{step === 1 ? '閉じる' : <><ChevronLeft />戻る</>}</Button>{step < 3 ? <Button type="button" onClick={nextStep}>次へ<ChevronRight /></Button> : <Button type="submit" disabled={submitting}>{submitting ? '保存中…' : mode === 'edit' ? '変更を保存' : `${preview.length}件を保存`}</Button>}</div>
  </form></Modal>;
}

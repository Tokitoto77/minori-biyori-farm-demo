import { FormEvent, useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock, Copy, Mail, Phone, Search, ShieldCheck, UserRound } from 'lucide-react';
import { Button, Counter, DemoNotice, EmptyState, Modal, StepIndicator } from '../components/Common';
import type { Navigate } from '../components/Shell';
import { calculatePrice, isContactNameCandidate, isEmailCandidate, isPhoneCandidate, MAX_GROUP_SIZE, partyTotal, yen } from '../domain/rules';
import type { Booking, CalendarSlot, Contact, Party, WaitlistEntry } from '../domain/types';
import type { BookingRepository, PublicRepository } from '../repositories/contracts';

type Result = { kind: 'booking'; value: Booking } | { kind: 'waitlist'; value: WaitlistEntry };

export function BookingFlow({ slotId, publicRepository, bookingRepository, navigate, onChanged, revision }: { slotId: string; publicRepository: PublicRepository; bookingRepository: BookingRepository; navigate: Navigate; onChanged: () => void; revision: number }) {
  const [slot, setSlot] = useState<CalendarSlot | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState(1);
  const [party, setParty] = useState<Party>({ adults: 2, children: 0, infants: 0 });
  const [contact, setContact] = useState<Contact>({ name: '', email: '', phone: '', note: '' });
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    setLoaded(false);
    publicRepository.getSlot(slotId).then((nextSlot) => { setSlot(nextSlot); setLoaded(true); });
  }, [publicRepository, slotId, revision]);
  const total = partyTotal(party);
  const totalPrice = slot ? calculatePrice(party, slot.prices) : 0;
  const waitlist = Boolean(slot && (slot.displayStatus === 'full' || slot.remaining < total));

  function updateParty(key: keyof Party, value: number) {
    const next = { ...party, [key]: value };
    if (partyTotal(next) <= MAX_GROUP_SIZE) setParty(next);
  }

  function validateContact() {
    if (!isContactNameCandidate(contact.name)) throw new Error('お名前は2〜100文字で入力してください。');
    if (!isEmailCandidate(contact.email)) throw new Error('メールアドレスの形式と長さを確認してください。');
    if (!isPhoneCandidate(contact.phone)) throw new Error('電話番号の形式と長さを確認してください。');
  }

  async function next() {
    setError('');
    try {
      if (step === 1) {
        if (total < 1) throw new Error('参加人数を1人以上選んでください。');
        setStep(2);
      } else if (step === 2) {
        validateContact();
        setStep(3);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : '入力内容をご確認ください。'); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!agreed || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const input = { slotId, party, contact };
      const value = waitlist ? await bookingRepository.createWaitlist(input) : await bookingRepository.createBooking(input);
      setResult(waitlist ? { kind: 'waitlist', value: value as WaitlistEntry } : { kind: 'booking', value: value as Booking });
      setContact({ name: '', email: '', phone: '', note: '' });
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '処理を完了できませんでした。');
    } finally { setSubmitting(false); }
  }

  if (!loaded) return <div className="page-loading">開催枠を確認しています…</div>;
  if (!slot) return <div className="booking-page section"><EmptyState title="開催枠が見つかりません">下書き中、削除済み、またはURLが正しくない可能性があります。カレンダーから開催枠を選び直してください。</EmptyState><div className="form-actions"><Button type="button" onClick={() => navigate('/')}>予約カレンダーへ戻る</Button></div></div>;
  if (result) return <Completion result={result} slot={slot} navigate={navigate} />;
  if (!['available', 'few', 'full'].includes(slot.displayStatus)) {
    return <div className="booking-page section"><button className="back-link" type="button" onClick={() => navigate(`/slot/${slotId}`)}><ArrowLeft />体験詳細へ戻る</button><EmptyState title="この開催枠は現在お申し込みできません">受付状況が変更されています。カレンダーから別の開催枠をお選びください。</EmptyState></div>;
  }

  return (
    <div className="booking-page section">
      <button className="back-link" type="button" onClick={() => step > 1 ? setStep(step - 1) : navigate(`/slot/${slotId}`)}><ArrowLeft />{step > 1 ? '前のステップへ' : '体験詳細へ戻る'}</button>
      <div className="booking-title"><span className="eyebrow">BOOKING</span><h1>{waitlist ? 'キャンセル待ちを申し込む' : '収穫体験を予約する'}</h1><p>{format(parseISO(slot.startAt), 'M月d日（E） H:mm', { locale: ja })}　{slot.experience.name}</p></div>
      <DemoNotice />
      <StepIndicator current={step} />
      <form className="booking-form" onSubmit={submit}>
        {step === 1 && <PartyStep slot={slot} party={party} updateParty={updateParty} total={total} totalPrice={totalPrice} waitlist={waitlist} />}
        {step === 2 && <ContactStep contact={contact} setContact={setContact} />}
        {step === 3 && <ConfirmStep slot={slot} party={party} contact={contact} total={total} totalPrice={totalPrice} waitlist={waitlist} agreed={agreed} setAgreed={setAgreed} />}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions">{step < 3 ? <Button type="button" onClick={next}>次へ進む <ArrowRight /></Button> : <Button type="submit" disabled={!agreed || submitting}>{submitting ? '処理しています…' : waitlist ? 'キャンセル待ちを申し込む' : 'この内容で予約する'} <ArrowRight /></Button>}</div>
      </form>
    </div>
  );
}

function PartyStep({ slot, party, updateParty, total, totalPrice, waitlist }: { slot: CalendarSlot; party: Party; updateParty: (key: keyof Party, value: number) => void; total: number; totalPrice: number; waitlist: boolean }) {
  return <section className="form-panel"><header><span>STEP 1</span><h2>何名で参加しますか？</h2><p>幼児を含む全員の人数を選んでください。</p></header><div className="counter-list"><Counter label="大人" help="中学生以上" price={yen(slot.prices.adult)} value={party.adults} onChange={(value) => updateParty('adults', value)} /><Counter label="子ども" help="3歳〜小学生" price={yen(slot.prices.child)} value={party.children} onChange={(value) => updateParty('children', value)} /><Counter label="幼児" help="0〜2歳" price={yen(slot.prices.infant)} value={party.infants} onChange={(value) => updateParty('infants', value)} /></div><div className="party-summary"><span>ご参加人数<strong>{total}<small>名</small></strong></span><span>残席<strong>{slot.remaining}<small>席</small></strong></span><span>合計料金<strong>{yen(totalPrice)}</strong></span></div>{waitlist && <p className="waitlist-hint">選択人数分の残席がないため、キャンセル待ちとして受け付けます。予約の確定は農園からのご案内後です。</p>}<p className="group-limit">1グループ最大10名まで。11名以上はお電話でご相談ください。</p></section>;
}

function ContactStep({ contact, setContact }: { contact: Contact; setContact: (contact: Contact) => void }) {
  return <section className="form-panel"><header><span>STEP 2</span><h2>代表者の連絡先</h2><p>開催変更時に連絡の取れる情報をご入力ください。</p></header><div className="field-grid"><label><span><UserRound />お名前 <b>必須</b></span><input type="text" autoComplete="name" value={contact.name} onChange={(event) => setContact({ ...contact, name: event.target.value })} placeholder="例：デモ 太郎" required /></label><label><span><Phone />電話番号 <b>必須</b></span><input type="tel" autoComplete="tel" value={contact.phone} onChange={(event) => setContact({ ...contact, phone: event.target.value })} placeholder="例：000-0000-0000" required /></label><label className="field-wide"><span><Mail />メールアドレス <b>必須</b></span><input type="email" autoComplete="email" value={contact.email} onChange={(event) => setContact({ ...contact, email: event.target.value })} placeholder="例：demo@example.invalid" required /><small>予約確認と開催変更のお知らせに使用します。</small></label><label className="field-wide"><span>備考 <i>任意</i></span><textarea value={contact.note} onChange={(event) => setContact({ ...contact, note: event.target.value })} placeholder="配慮が必要なことなど（デモでは保存されません）" rows={4} /></label></div></section>;
}

function ConfirmStep({ slot, party, contact, total, totalPrice, waitlist, agreed, setAgreed }: { slot: CalendarSlot; party: Party; contact: Contact; total: number; totalPrice: number; waitlist: boolean; agreed: boolean; setAgreed: (value: boolean) => void }) {
  return <section className="form-panel"><header><span>STEP 3</span><h2>予約内容の確認</h2><p>日付と人数をもう一度ご確認ください。</p></header><div className="confirmation"><dl><div><dt>体験</dt><dd>{slot.experience.name}</dd></div><div><dt>日時</dt><dd>{format(parseISO(slot.startAt), 'yyyy年M月d日（E） H:mm', { locale: ja })}</dd></div><div><dt>人数</dt><dd>大人{party.adults}名・子ども{party.children}名・幼児{party.infants}名（合計{total}名）</dd></div><div><dt>合計料金</dt><dd><strong>{yen(totalPrice)}</strong></dd></div><div><dt>代表者</dt><dd>{contact.name}（送信後は固定ダミー値へ置換）</dd></div><div><dt>キャンセル期限</dt><dd>{format(parseISO(slot.cancellationDeadline), 'M月d日 H:mm')}</dd></div></dl>{waitlist && <p className="waitlist-hint">これは予約確定ではありません。空きが出た後、農園が残席を確認して手動で繰り上げます。</p>}<label className="agreement"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /><span><ShieldCheck />注意事項・キャンセル方針と、デモでは入力した個人情報を保存しないことに同意します。</span></label></div></section>;
}

function Completion({ result, slot, navigate }: { result: Result; slot: CalendarSlot; navigate: Navigate }) {
  const code = result.value.code;
  const isWaitlist = result.kind === 'waitlist';
  return <div className="completion"><div className="completion-mark"><Check /></div><span className="eyebrow">{isWaitlist ? 'WAITLIST RECEIVED' : 'BOOKING COMPLETE'}</span><h1>{isWaitlist ? 'キャンセル待ちを受け付けました' : 'ご予約を受け付けました'}</h1><p>{isWaitlist ? '空きが出た場合は、農園が確認後にご案内します。' : '畑でお会いできるのを楽しみにしています。'}</p><div className="completion-card"><span>{isWaitlist ? '待機番号' : '予約番号'}</span><strong>{code}</strong><button type="button" onClick={() => navigator.clipboard?.writeText(code)}><Copy />番号をコピー</button><dl><div><dt>体験</dt><dd>{slot.experience.name}</dd></div><div><dt>日時</dt><dd>{format(parseISO(slot.startAt), 'M月d日（E） H:mm', { locale: ja })}</dd></div>{isWaitlist && <div><dt>待ち順</dt><dd>{result.value.queueNumber}番</dd></div>}</dl></div><div className="notification-preview"><Mail /><div><span>メール通知プレビュー</span><strong>{isWaitlist ? 'キャンセル待ちを受け付けました' : 'ご予約を受け付けました'}</strong><p>宛先：デモ利用者 &lt;demo@example.invalid&gt;</p><small>デモのため、外部メールは送信していません。</small></div></div><p className="lookup-help">予約確認では <strong>{code}</strong> と <strong>demo@example.invalid</strong> を使用してください。</p><div className="completion-actions"><Button onClick={() => navigate('/lookup')}>予約内容を確認する</Button><Button variant="secondary" onClick={() => navigate('/')}>トップへ戻る</Button></div></div>;
}

export function LookupPage({ publicRepository, bookingRepository, navigate, onChanged }: { publicRepository: PublicRepository; bookingRepository: BookingRepository; navigate: Navigate; onChanged: () => void }) {
  const [code, setCode] = useState('MB-DEMO-7K3P');
  const [email, setEmail] = useState('demo@example.invalid');
  const [booking, setBooking] = useState<Booking | null>(null);
  const [slot, setSlot] = useState<CalendarSlot | null>(null);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);

  async function lookup(event: FormEvent) {
    event.preventDefault(); setError(''); setSearched(true);
    const found = await bookingRepository.lookupBooking(code, email);
    setBooking(found);
    setSlot(found ? await publicRepository.getSlot(found.slotId) : null);
  }

  async function cancel() {
    if (!booking) return;
    try {
      const canceled = await bookingRepository.cancelBooking(code, email);
      setBooking(canceled); setCancelOpen(false); onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'キャンセルできませんでした。'); }
  }

  const active = booking?.status === 'confirmed';
  return <div className="lookup-page section"><button className="back-link" type="button" onClick={() => navigate('/')}><ArrowLeft />トップへ戻る</button><div className="lookup-heading"><span className="eyebrow">FIND YOUR BOOKING</span><h1>予約内容を確認する</h1><p>予約番号と、ご予約時のメールアドレスを入力してください。</p></div><DemoNotice /><form className="lookup-form" onSubmit={lookup}><label><span>予約番号</span><div><Search /><input value={code} onChange={(event) => setCode(event.target.value)} placeholder="MB-DEMO-XXXX" required /></div></label><label><span>メールアドレス</span><div><Mail /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div></label><Button type="submit">予約を照会する</Button><small>デモ確認用：MB-DEMO-7K3P / demo@example.invalid</small></form>{error && <p className="form-error">{error}</p>}{searched && !booking && <EmptyState title="予約が見つかりません">番号とメールアドレスをご確認ください。存在有無を推測されないよう、詳細な理由は表示しません。</EmptyState>}{booking && slot && <article className="booking-result"><header><span className={active ? 'result-status result-status--active' : 'result-status'}>{active ? '予約確定' : booking.status === 'canceledByGuest' ? 'キャンセル済み' : '開催中止'}</span><strong>{booking.code}</strong></header><dl><div><dt><CalendarDays />体験・日時</dt><dd>{slot.experience.name}<small>{format(parseISO(slot.startAt), 'yyyy年M月d日（E） H:mm', { locale: ja })}</small></dd></div><div><dt><UserRound />人数</dt><dd>合計 {booking.totalPeople}名<small>大人{booking.party.adults}・子ども{booking.party.children}・幼児{booking.party.infants}</small></dd></div><div><dt>合計料金</dt><dd>{yen(booking.totalPrice)}</dd></div></dl>{active && <div className="cancel-zone"><div><strong>キャンセルについて</strong><p>{format(parseISO(slot.cancellationDeadline), 'M月d日 H:mm')}までWebでキャンセルできます。</p></div><Button variant="danger" onClick={() => setCancelOpen(true)}>予約をキャンセル</Button></div>}</article>}{cancelOpen && <Modal title="予約をキャンセルしますか？" onClose={() => setCancelOpen(false)}><div className="confirm-modal"><p>キャンセル後は元に戻せません。予約番号 <strong>{booking?.code}</strong> の内容を取り消します。</p><div className="modal-actions"><Button variant="secondary" type="button" onClick={() => setCancelOpen(false)}>予約を残す</Button><Button variant="danger" type="button" onClick={cancel}>キャンセルを確定</Button></div></div></Modal>}</div>;
}

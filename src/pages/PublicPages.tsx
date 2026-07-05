import { useEffect, useRef, useState, type UIEvent } from 'react';
import { addMonths, eachDayOfInterval, endOfMonth, format, getDay, isSameDay, parseISO, startOfMonth, subMonths } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Clock, CloudRain, Shirt, ShoppingBag, ShoppingBasket, Sprout } from 'lucide-react';
import type { CalendarSlot, DisplaySlotStatus, Experience } from '../domain/types';
import type { PublicRepository } from '../repositories/contracts';
import { getSlotCallToAction, statusLabels, yen } from '../domain/rules';
import { resolveCalendarDayStatus, selectInitialCalendarDate, visibleCalendarStatuses } from '../domain/calendarPresentation';
import { Button, EmptyState, StatusBadge } from '../components/Common';
import type { Navigate } from '../components/Shell';

const shortStatusLabels: Record<DisplaySlotStatus, string> = {
  available: '受付中',
  few: '残り少',
  full: '満員',
  adjusting: '調整中',
  paused: '停止',
  cancelled: '中止',
  outside: '—',
};
const planImages: Record<string, string> = {
  strawberry: '/images/plan-strawberry.png',
  blueberry: '/images/plan-blueberry.png',
  herb: '/images/plan-herb.png',
};

export function PublicHome({ repository, navigate, revision }: { repository: PublicRepository; navigate: Navigate; revision: number }) {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [slots, setSlots] = useState<CalendarSlot[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [nextSlots, setNextSlots] = useState<Record<string, CalendarSlot | null>>({});
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [autoAdvanced, setAutoAdvanced] = useState(false);
  const [activeCrop, setActiveCrop] = useState(0);
  const cropSelectorRef = useRef<HTMLDivElement>(null);
  const selectedDateRef = useRef<Date | null>(null);

  function commitSelectedDate(date: Date | null) {
    selectedDateRef.current = date;
    setSelectedDate(date);
  }

  useEffect(() => {
    let active = true;
    repository.listExperiences().then(async (items) => {
      const upcoming = await Promise.all(items.map(async (experience) => (
        [experience.id, await repository.findNextPublishedSlot(experience.id, new Date().toISOString())] as const
      )));
      if (!active) return;
      setExperiences(items);
      setNextSlots(Object.fromEntries(upcoming));
    });
    return () => { active = false; };
  }, [repository, revision]);

  useEffect(() => {
    let active = true;
    repository.listCalendar(format(month, 'yyyy-MM')).then((items) => {
      if (!active) return;
      if (!items.length && !autoAdvanced && format(month, 'yyyy-MM') === format(new Date(), 'yyyy-MM')) {
        setAutoAdvanced(true);
        setMonth(addMonths(month, 1));
        return;
      }
      setSlots(items);
      const currentSelectedDate = selectedDateRef.current;
      if (!items.some((slot) => currentSelectedDate && isSameDay(parseISO(slot.startAt), currentSelectedDate))) {
        const initialDate = selectInitialCalendarDate(items);
        const nextSelectedDate = initialDate ? parseISO(initialDate) : null;
        commitSelectedDate(nextSelectedDate);
      }
    });
    return () => { active = false; };
  }, [month, repository, revision, autoAdvanced]);

  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
  const selectedSlots = selectedDate ? slots.filter((slot) => isSameDay(parseISO(slot.startAt), selectedDate)) : [];
  const legendStatuses = visibleCalendarStatuses(slots);
  function selectExperience(experienceId: string) {
    const nextSlot = nextSlots[experienceId];
    if (!nextSlot) return;
    const nextDate = parseISO(nextSlot.startAt);
    setMonth(startOfMonth(nextDate));
    commitSelectedDate(nextDate);
    document.getElementById('calendar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function updateCropPager(event: UIEvent<HTMLDivElement>) {
    const selector = event.currentTarget;
    const card = selector.querySelector<HTMLElement>('.crop-card');
    if (!card) return;
    const gap = Number.parseFloat(getComputedStyle(selector).columnGap) || 0;
    const index = Math.round(selector.scrollLeft / (card.offsetWidth + gap));
    setActiveCrop(Math.max(0, Math.min(experiences.length - 1, index)));
  }

  function showCrop(index: number) {
    const selector = cropSelectorRef.current;
    const card = selector?.children[index] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
    setActiveCrop(index);
  }

  return (
    <div className="harvest-home">
      <section className="app-hero" aria-labelledby="harvest-title">
        <div className="app-hero__copy">
          <span>MINORI BIYORI FARM</span>
          <h1 id="harvest-title">季節の<br />収穫体験を予約</h1>
          <p>旬の実りを、<br />家族の思い出に。</p>
        </div>
        <div className="app-hero__media">
          <img src="/images/hero-strawberry-picking.jpg" alt="明るい温室で大粒のいちごを摘み取る手元" />
        </div>
      </section>

      <section className="crop-selector" aria-label="体験の種類を選ぶ" ref={cropSelectorRef} onScroll={updateCropPager}>
        {experiences.map((experience) => {
          const nextSlot = nextSlots[experience.id];
          return (
          <button type="button" key={experience.id} className={`crop-card crop-card--${experience.slug}`} onClick={() => selectExperience(experience.id)} aria-disabled={!nextSlot} aria-label={nextSlot ? `${experience.name}の次回開催日へ移動` : `${experience.name}は現在開催予定がありません`}>
            <img src={planImages[experience.slug] ?? experience.image} alt="" />
            <span>
              <strong>{experience.slug === 'strawberry' ? 'いちご' : experience.slug === 'blueberry' ? 'ブルーベリー' : 'ハーブ'}</strong>
              <small>{experience.summary}</small>
              <em>{nextSlot ? `次回 ${format(parseISO(nextSlot.startAt), 'M月d日(E)', { locale: ja })}` : '現在開催予定なし'}</em>
            </span>
            {nextSlot && <ArrowRight aria-hidden="true" />}
          </button>
        )})}
      </section>
      <div className="crop-pager" aria-label="体験プランの表示を切り替える">
        {experiences.map((experience, index) => <button type="button" key={experience.id} className={activeCrop === index ? 'is-active' : ''} onClick={() => showCrop(index)} aria-label={`${experience.name}を表示`} aria-current={activeCrop === index ? 'true' : undefined} />)}
      </div>

      <section className="booking-board" id="calendar">
        <div className="calendar-title-row">
          <div><CalendarDays /><h2>{format(month, 'M月')}の予約カレンダー</h2></div>
        </div>
        <div className="calendar-layout">
          <div className="calendar-card">
            <header className="calendar-header">
              <button type="button" aria-label="前の月" onClick={() => setMonth(subMonths(month, 1))}><ChevronLeft /></button>
              <h3>{format(month, 'yyyy年 M月')}</h3>
              <button type="button" aria-label="次の月" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight /></button>
            </header>
            <div className="weekdays" aria-hidden="true">{['日', '月', '火', '水', '木', '金', '土'].map((day) => <span key={day}>{day}</span>)}</div>
            <div className="calendar-grid">
              {Array.from({ length: getDay(startOfMonth(month)) }, (_, index) => <span className="calendar-blank" key={`blank-${index}`} />)}
              {days.map((day) => {
                const daySlots = slots.filter((slot) => isSameDay(parseISO(slot.startAt), day));
                const status = daySlots.length ? resolveCalendarDayStatus(daySlots) : null;
                const selected = selectedDate && isSameDay(day, selectedDate);
                return (
                  <button key={day.toISOString()} type="button" disabled={!daySlots.length} className={`${status ? `calendar-day--${status}` : 'calendar-day--empty'}${selected ? ' is-selected' : ''}`} onClick={() => commitSelectedDate(day)} aria-pressed={Boolean(selected)} aria-label={`${format(day, 'M月d日')} ${status ? statusLabels[status] : '開催なし'}`}>
                    <span className="day-number">{format(day, 'd')}</span>
                    {status ? <span className={`day-status day-status--${status}`}><span className="day-status__long">{statusLabels[status]}</span><span className="day-status__short">{shortStatusLabels[status]}</span></span> : <span className="day-status" aria-hidden="true" />}
                    {selected && <span className="selected-marker" aria-hidden="true">✓</span>}
                  </button>
                );
              })}
            </div>
            {legendStatuses.length > 0 && <details className="calendar-legend"><summary>予約状況の見方</summary><div aria-label="予約状況の凡例">{legendStatuses.map((status) => <span key={status}><i className={`legend-dot legend-dot--${status}`} />{statusLabels[status]}</span>)}</div></details>}
          </div>
          <aside className="slot-panel" aria-live="polite">
            <header><Sprout /><h3>{selectedDate ? `${format(selectedDate, 'M月d日(E)', { locale: ja })}の体験プラン` : '日付を選択'}</h3></header>
            {selectedSlots.length ? selectedSlots.map((slot) => <SlotCard key={slot.id} slot={slot} onClick={() => navigate(`/slot/${slot.id}`)} />) : <EmptyState title="この日の開催はありません">状態表示のある日付を選んでください。</EmptyState>}
            <button className="booking-lookup" type="button" onClick={() => navigate('/lookup')}><SearchIcon />予約内容を確認する <ChevronRight /></button>
          </aside>
        </div>
      </section>

      <section className="visit-guide" aria-label="体験のご案内">
        <h2>ご案内</h2>
        <div><Clock /><span><strong>所要時間</strong><em>各体験45〜60分程度</em><small>受付・説明時間を含みます</small></span><ChevronRight className="guide-chevron" /></div>
        <div><ShoppingBag /><span><strong>持ち物</strong><em>動きやすい服装・帽子</em><small>飲み物・タオル・日焼け止め</small></span><ChevronRight className="guide-chevron" /></div>
        <div><CloudRain /><span><strong>雨天時の対応</strong><em>小雨決行・荒天中止</em><small>中止の場合はご連絡します</small></span><ChevronRight className="guide-chevron" /></div>
      </section>
    </div>
  );
}

function SearchIcon() { return <ClipboardList aria-hidden="true" />; }

function SlotCard({ slot, onClick }: { slot: CalendarSlot; onClick: () => void }) {
  const action = getSlotCallToAction(slot);
  const unavailable = action.kind === 'unavailable';
  const availabilityLabel = unavailable ? action.label : action.kind === 'waitlist' ? '満員' : `残り ${slot.remaining}席`;
  const availabilityClass = unavailable ? 'is-unavailable' : action.kind === 'waitlist' ? 'is-full' : slot.remaining <= slot.fewThreshold ? 'is-few' : '';
  return <article className={`slot-card slot-card--${slot.experience.slug}${unavailable ? ' is-unavailable' : ''}`}><img className="slot-thumb" src={planImages[slot.experience.slug] ?? slot.experience.image} alt="" /><div className="slot-main"><h4>{slot.experience.name}</h4><p><Clock />{format(parseISO(slot.startAt), 'H:mm')}〜{format(parseISO(slot.endAt), 'H:mm')}</p></div><div className="slot-price"><span>大人 {yen(slot.prices.adult)} / 小人 {yen(slot.prices.child)}</span><strong className={availabilityClass}>{availabilityLabel}</strong></div><button type="button" className={action.kind === 'waitlist' ? 'is-waiting' : unavailable ? 'is-unavailable' : ''} onClick={onClick} disabled={unavailable} aria-label={unavailable ? `${slot.experience.name}は${action.label}です` : `${slot.experience.name} ${format(parseISO(slot.startAt), 'H時mm分')}の詳細を見る`}>{action.label}{!unavailable && <ArrowRight />}</button></article>;
}

export function SlotDetail({ slotId, repository, navigate, revision }: { slotId: string; repository: PublicRepository; navigate: Navigate; revision: number }) {
  const [slot, setSlot] = useState<CalendarSlot | null>(null);
  useEffect(() => { repository.getSlot(slotId).then(setSlot); }, [repository, slotId, revision]);
  if (!slot) return <div className="page-loading">開催枠を確認しています…</div>;
  const action = getSlotCallToAction(slot);
  const actionable = action.kind !== 'unavailable';
  return (
    <div className="detail-page section">
      <button className="back-link" type="button" onClick={() => navigate('/')}><ChevronLeft />カレンダーへ戻る</button>
      <article className="detail-hero"><div><img src={slot.experience.image} alt={`${slot.experience.name}の様子`} /></div><div><StatusBadge status={slot.displayStatus} /><span className="eyebrow">{slot.experience.eyebrow}</span><h1>{slot.experience.name}</h1><p>{slot.experience.description}</p><dl className="date-summary"><div><dt>開催日</dt><dd>{format(parseISO(slot.startAt), 'yyyy年M月d日（E）', { locale: ja })}</dd></div><div><dt>時間</dt><dd>{format(parseISO(slot.startAt), 'H:mm')}〜 ・ 約{slot.experience.durationMinutes}分</dd></div><div><dt>残席</dt><dd>{slot.remaining}席 / 定員{slot.capacity}名</dd></div></dl></div></article>
      <div className="detail-columns"><section className="detail-info"><h2>体験のご案内</h2><ul><li><Shirt /><span><strong>服装</strong>{slot.experience.clothing}</span></li><li><ShoppingBasket /><span><strong>持ち物</strong>{slot.experience.belongings}</span></li><li><CloudRain /><span><strong>雨天時</strong>{slot.experience.rainPolicy}</span></li></ul><h3>料金</h3><div className="price-table"><span>大人<small>中学生以上</small><strong>{yen(slot.prices.adult)}</strong></span><span>子ども<small>3歳〜小学生</small><strong>{yen(slot.prices.child)}</strong></span><span>幼児<small>0〜2歳</small><strong>{yen(slot.prices.infant)}</strong></span></div><p className="detail-note">{slot.note}</p></section><aside className="detail-action"><h2>{actionable ? 'この体験を予約' : '受付状況'}</h2>{actionable ? <><p>{action.message}</p><Button onClick={() => navigate(`/book/${slot.id}`)}>{action.kind === 'waitlist' ? 'キャンセル待ちへ進む' : action.label}<ArrowRight /></Button></> : <><StatusBadge status={slot.displayStatus} /><p>{action.message}</p><a href="mailto:demo@example.invalid">農園へ問い合わせる</a></>}<small>キャンセル期限：{format(parseISO(slot.cancellationDeadline), 'M月d日 H:mm')}</small></aside></div>
    </div>
  );
}

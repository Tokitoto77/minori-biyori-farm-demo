import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AlertTriangle, Check, Info, Minus, Plus, X } from 'lucide-react';
import { statusLabels } from '../domain/rules';
import type { DisplaySlotStatus } from '../domain/types';
import { cn } from '../lib/utils';

export function DemoNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn('demo-notice', compact && 'demo-notice--compact')} role="note">
      <AlertTriangle aria-hidden="true" />
      <div>
        <strong>これは販売デモです</strong>
        {!compact && <span>実在する氏名・電話番号・メールアドレスは入力しないでください。入力内容は保存せず、固定ダミー値へ置き換えます。</span>}
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: DisplaySlotStatus }) {
  return <span className={`status-badge status-badge--${status}`}><span aria-hidden="true" />{statusLabels[status]}</span>;
}

export function Button({ className, variant = 'primary', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <button className={cn('button', `button--${variant}`, className)} {...props}>{children}</button>;
}

export function Counter({ label, help, value, onChange, price }: { label: string; help: string; value: number; onChange: (value: number) => void; price: string }) {
  return (
    <div className="counter-row">
      <div>
        <strong>{label}</strong>
        <span>{help} ・ {price}</span>
      </div>
      <div className="counter" aria-label={`${label}の人数`}>
        <button type="button" aria-label={`${label}を1人減らす`} onClick={() => onChange(Math.max(0, value - 1))} disabled={value === 0}><Minus /></button>
        <output aria-live="polite">{value}<small>人</small></output>
        <button type="button" aria-label={`${label}を1人増やす`} onClick={() => onChange(value + 1)}><Plus /></button>
      </div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty-state"><Info aria-hidden="true" /><strong>{title}</strong><p>{children}</p></div>;
}

export function Modal({ title, children, onClose, className }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section ref={dialogRef} className={cn('modal', className)} role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><h2 id="modal-title">{title}</h2><button ref={closeRef} type="button" onClick={onClose} aria-label="閉じる"><X /></button></header>
        {children}
      </section>
    </div>
  );
}

export function StepIndicator({ current }: { current: number }) {
  const labels = ['人数', '代表者', '確認'];
  return <ol className="steps" aria-label="予約の進行状況">{labels.map((label, index) => <li key={label} className={index + 1 <= current ? 'is-active' : ''}><span>{index + 1 < current ? <Check /> : index + 1}</span>{label}</li>)}</ol>;
}

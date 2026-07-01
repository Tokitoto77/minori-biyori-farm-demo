import { useEffect, useState, type ReactNode } from 'react';
import { CalendarDays, HelpCircle, Home, Menu, Search, Settings, X } from 'lucide-react';
import { Button, DemoNotice, Modal } from './Common';
import { BrandLogo } from './BrandLogo';

export type Navigate = (path: string) => void;

export function Shell({ children, navigate, admin = false }: { children: ReactNode; navigate: Navigate; admin?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [pendingSection, setPendingSection] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingSection) return;
    const section = document.getElementById(pendingSection);
    if (!section) return;
    requestAnimationFrame(() => section.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    setPendingSection(null);
  }, [children, pendingSection]);

  const go = (path: string) => {
    setMenuOpen(false);
    navigate(path);
  };

  const goToSection = (sectionId: string) => {
    setMenuOpen(false);
    setPendingSection(sectionId);
    navigate('/');
  };

  const openContact = () => {
    setMenuOpen(false);
    setContactOpen(true);
  };

  return (
    <div className={admin ? 'app app--admin' : 'app'}>
      <DemoNotice compact />
      <header className="site-header">
        <button className="brand" type="button" onClick={() => go('/')} aria-label="みのり日和ファーム ホームへ">
          <BrandLogo />
          <span><strong>みのり日和ファーム</strong><small>季節の収穫体験を予約</small></span>
        </button>
        <button className="menu-toggle" type="button" aria-label={menuOpen ? 'メニューを閉じる' : 'メニューを開く'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
          {menuOpen ? <X /> : <Menu />}<span>メニュー</span>
        </button>
        <nav className={`header-menu ${menuOpen ? 'is-open' : ''}`} aria-label="メインナビゲーション">
          <button type="button" onClick={() => goToSection('calendar')}><CalendarDays />体験を探す</button>
          <button type="button" onClick={() => go('/lookup')}><Search />予約確認</button>
          <button type="button" onClick={openContact}><HelpCircle />お問い合わせ</button>
          <button className="admin-link" type="button" onClick={() => go('/admin')}><Settings />{admin ? '利用者画面' : '管理画面を試す'}</button>
        </nav>
      </header>
      <main>{children}</main>
      {!admin && (
        <nav className="mobile-nav" aria-label="モバイルナビゲーション">
          <button type="button" onClick={() => go('/')}><Home />ホーム</button>
          <button type="button" onClick={() => goToSection('calendar')}><CalendarDays />体験を探す</button>
          <button type="button" onClick={() => go('/lookup')}><Search />予約確認</button>
          <button type="button" onClick={openContact}><HelpCircle />お問い合わせ</button>
        </nav>
      )}
      <footer className="site-footer">
        <div className="brand brand--footer"><BrandLogo /><span><strong>みのり日和ファーム</strong><small>土と季節を、家族の記憶に。</small></span></div>
        <p>〒000-0000 ○○県○○市みのり町0-0　電話 000-0000-0000</p>
        <small>このサイトは販売用デモです。記載の農園・連絡先は架空です。</small>
      </footer>
      {contactOpen && <Modal title="お問い合わせについて" onClose={() => setContactOpen(false)} className="contact-modal"><div className="contact-dialog"><span className="contact-dialog__icon"><HelpCircle /></span><strong>この画面は販売デモです</strong><p>実際のメール送信や電話発信は行いません。本番導入時は、農園の電話番号・メールフォーム・営業時間を設定できます。</p><dl><div><dt>デモ連絡先</dt><dd>000-0000-0000</dd></div><div><dt>受付時間</dt><dd>9:00〜17:00（デモ表示）</dd></div></dl><div className="modal-actions"><Button type="button" onClick={() => setContactOpen(false)}>内容を確認しました</Button></div></div></Modal>}
    </div>
  );
}

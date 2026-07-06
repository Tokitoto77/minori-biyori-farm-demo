import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createServices } from './app/createServices';
import { Shell, type Navigate } from './components/Shell';
import { DEMO_UPDATED_EVENT } from './demo/storage';
import { BookingFlow, LookupPage } from './pages/BookingPages';
import NewAdminShell from './pages/NewAdminShell';
import { PublicHome, SlotDetail } from './pages/PublicPages';

export default function App() {
  const services = useMemo(() => createServices(), []);
  const [revision, setRevision] = useState(0);
  const location = useLocation();
  const routerNavigate = useNavigate();
  const path = location.pathname;

  useEffect(() => {
    const onDemoChange = () => setRevision((value) => value + 1);
    window.addEventListener('storage', onDemoChange);
    window.addEventListener(DEMO_UPDATED_EVENT, onDemoChange);
    return () => {
      window.removeEventListener('storage', onDemoChange);
      window.removeEventListener(DEMO_UPDATED_EVENT, onDemoChange);
    };
  }, []);

  useEffect(() => {
    const legacyHashPath = window.location.hash.replace(/^#/, '');
    if (legacyHashPath.startsWith('/')) {
      routerNavigate({ pathname: legacyHashPath, hash: '' }, { replace: true });
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [path, routerNavigate]);

  const navigate: Navigate = (nextPath) => {
    if (path === nextPath) window.scrollTo({ top: 0, behavior: 'smooth' });
    else routerNavigate(nextPath);
  };
  const onChanged = () => setRevision((value) => value + 1);

  if (path === '/admin') {
    return <NewAdminShell repository={services.adminRepository} revision={revision} onChanged={onChanged} />;
  }

  let page = <PublicHome repository={services.publicRepository} navigate={navigate} revision={revision} />;
  if (path === '/lookup') {
    page = <LookupPage publicRepository={services.publicRepository} bookingRepository={services.bookingRepository} navigate={navigate} onChanged={onChanged} />;
  } else if (path.startsWith('/slot/')) {
    page = <SlotDetail slotId={decodeURIComponent(path.slice('/slot/'.length))} repository={services.publicRepository} navigate={navigate} revision={revision} />;
  } else if (path.startsWith('/book/')) {
    page = <BookingFlow slotId={decodeURIComponent(path.slice('/book/'.length))} publicRepository={services.publicRepository} bookingRepository={services.bookingRepository} navigate={navigate} onChanged={onChanged} revision={revision} />;
  }

  return <Shell navigate={navigate}>{page}</Shell>;
}

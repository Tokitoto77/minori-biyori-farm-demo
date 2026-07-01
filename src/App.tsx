import { useEffect, useMemo, useState } from 'react';
import { createServices } from './app/createServices';
import { Shell, type Navigate } from './components/Shell';
import { DEMO_UPDATED_EVENT } from './demo/storage';
import { AdminPage } from './pages/AdminPage';
import { BookingFlow, LookupPage } from './pages/BookingPages';
import { PublicHome, SlotDetail } from './pages/PublicPages';

function currentPath(): string {
  return window.location.hash.replace(/^#/, '') || '/';
}

export default function App() {
  const services = useMemo(() => createServices(), []);
  const [path, setPath] = useState(currentPath);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const onHashChange = () => { setPath(currentPath()); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    const onDemoChange = () => setRevision((value) => value + 1);
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener(DEMO_UPDATED_EVENT, onDemoChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener(DEMO_UPDATED_EVENT, onDemoChange);
    };
  }, []);

  const navigate: Navigate = (nextPath) => {
    if (currentPath() === nextPath) window.scrollTo({ top: 0, behavior: 'smooth' });
    else window.location.hash = nextPath;
  };
  const onChanged = () => setRevision((value) => value + 1);

  if (path === '/admin') {
    return <AdminPage repository={services.adminRepository} navigate={navigate} revision={revision} onChanged={onChanged} />;
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

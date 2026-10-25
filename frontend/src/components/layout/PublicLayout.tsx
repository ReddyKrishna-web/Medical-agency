import { Outlet } from 'react-router-dom';
import { PublicHeader } from './PublicHeader';
import { PublicFooter } from './PublicFooter';

export default function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-ivory text-charcoal">
      <PublicHeader />
      <main id="main-content" className="flex-1">
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  );
}

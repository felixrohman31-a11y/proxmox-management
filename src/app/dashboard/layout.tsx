import { redirect } from 'next/navigation';
import { getSessionFromCookies } from '@/lib/session';
import { MobileHeader, Sidebar } from '@/components/nav';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = getSessionFromCookies();
  if (!session) redirect('/login');
  const role = session.role === 'admin' ? 'admin' : 'viewer';
  return (
    <div className="min-h-screen">
      <MobileHeader username={session.u} role={role} />
      <div className="mx-auto flex w-full max-w-[1400px]">
        <Sidebar username={session.u} role={role} />
        <main className="min-w-0 flex-1 px-4 pb-16 pt-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

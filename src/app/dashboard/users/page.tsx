import { redirect } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import UsersManager from '@/components/UsersManager';
import { serverT } from '@/lib/locale-server';
import { getSessionFromCookies } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const session = getSessionFromCookies();
  const L = serverT();
  if (!session) redirect('/login');
  if (session.role !== 'superadmin' && session.role !== 'admin') redirect('/dashboard');

  return (
    <>
      <PageHeader title={L.users.title} subtitle={L.users.sub} />
      <UsersManager currentUserId={session.id} currentRole={session.role} />
    </>
  );
}

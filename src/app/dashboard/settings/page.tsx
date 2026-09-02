import PageHeader from '@/components/PageHeader';
import FtpBackupPanel from '@/components/FtpBackupPanel';
import AccountPanel from '@/components/AccountPanel';
import { serverT } from '@/lib/locale-server';
import WaPanel from '@/components/WaPanel';
import AuditTable from '@/components/AuditTable';
import LangToggle from '@/components/LangToggle';
import { listClustersSync } from '@/lib/store';
import { getSessionFromCookies } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  const L = serverT();
  const session = getSessionFromCookies();
  const isAdmin = session?.role === 'admin';
  const clusters = listClustersSync();
  return (
    <>
      <PageHeader title={L.settings.title} subtitle={L.settings.sub} />
      <div className="space-y-6">
        <div className="card flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-medium text-zinc-200">{L.settings.langTitle}</p>
            <p className="text-xs text-zinc-500">{L.settings.langDesc}</p>
          </div>
          <LangToggle />
        </div>
        <AccountPanel />
        {isAdmin && (
          <>
            <FtpBackupPanel clusters={clusters} />
            <WaPanel />
          </>
        )}
        <AuditTable />
      </div>
    </>
  );
}

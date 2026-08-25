import PageHeader from '@/components/PageHeader';
import FtpBackupPanel from '@/components/FtpBackupPanel';
import { serverT } from '@/lib/locale-server';
import WaPanel from '@/components/WaPanel';
import AuditTable from '@/components/AuditTable';
import { listClustersSync } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  const L = serverT();
  const clusters = listClustersSync();
  return (
    <>
      <PageHeader title={L.settings.title} subtitle={L.settings.sub} />
      <div className="space-y-6">
        <FtpBackupPanel clusters={clusters} />
        <WaPanel />
        <AuditTable />
      </div>
    </>
  );
}

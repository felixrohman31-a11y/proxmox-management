import PageHeader from '@/components/PageHeader';
import FtpBackupPanel from '@/components/FtpBackupPanel';
import WaPanel from '@/components/WaPanel';
import AuditTable from '@/components/AuditTable';
import { listClustersSync } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  const clusters = listClustersSync();
  return (
    <>
      <PageHeader title="Pengaturan" subtitle="Backup, notifikasi, dan jejak audit panel" />
      <div className="space-y-6">
        <FtpBackupPanel clusters={clusters} />
        <WaPanel />
        <AuditTable />
      </div>
    </>
  );
}

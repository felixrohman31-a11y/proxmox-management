import PageHeader from '@/components/PageHeader';
import FtpBackupPanel from '@/components/FtpBackupPanel';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Pengaturan" subtitle="Konfigurasi backup dan preferensi panel" />
      <FtpBackupPanel />
    </>
  );
}

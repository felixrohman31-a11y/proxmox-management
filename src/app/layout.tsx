import type { Metadata } from 'next';
import './globals.css';
import { getServerLocale } from '@/lib/locale-server';
import { LangProvider } from '@/components/lang-context';

export const metadata: Metadata = {
  title: 'Proxmox Management',
  description: 'Multi-cluster Proxmox VE management panel'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = getServerLocale();
  return (
    <html lang={locale}>
      <body>
        <LangProvider initial={locale}>{children}</LangProvider>
      </body>
    </html>
  );
}

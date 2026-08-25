import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Proxmox Management',
  description: 'Sentral manajemen multi-cluster Proxmox VE via API'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}

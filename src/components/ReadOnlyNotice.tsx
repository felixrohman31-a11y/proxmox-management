'use client';

import { useL } from './lang-context';

// Peringatan yang ditampilkan ke akun read-only pada halaman yang memuat aksi
// mutasi (create, backup, dan sejenisnya).
export default function ReadOnlyNotice() {
  const L = useL();
  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-sky-900/60 bg-sky-950/40 p-4 text-sm text-sky-300">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 h-4 w-4 shrink-0"
        aria-hidden="true"
      >
        <path d="M12 3l7 3v5c0 4.6-3 8.6-7 10-4-1.4-7-5.4-7-10V6l7-3z" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>
      <span>{L.common.readOnlyNotice}</span>
    </div>
  );
}

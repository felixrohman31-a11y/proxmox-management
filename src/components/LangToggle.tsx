'use client';

import { useL, setLangCookie, useLocale } from './lang-context';

export default function LangToggle({ compact = false }: { compact?: boolean }) {
  const locale = useLocale();
  const L = useL();

  function switchTo(l: 'id' | 'en') {
    if (l === locale) return;
    setLangCookie(l);
    window.location.reload();
  }

  return (
    <div
      className="flex overflow-hidden rounded-lg border border-zinc-700 text-[11px] font-semibold"
      title={L.nav.settings}
    >
      {(['id', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => switchTo(l)}
          className={`px-2 py-1 uppercase transition ${
            locale === l
              ? 'bg-orange-500/15 text-orange-400'
              : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
          } ${compact ? 'px-1.5' : ''}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

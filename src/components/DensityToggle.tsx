'use client';

import { useEffect, useState } from 'react';

export default function DensityToggle({
  compactLabel,
  comfortableLabel
}: {
  compactLabel: string;
  comfortableLabel: string;
}) {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    let isC = false;
    try {
      isC = localStorage.getItem('pm_compact') === '1';
    } catch {
      /* noop */
    }
    setCompact(isC);
    document.documentElement.dataset.compact = isC ? 'true' : 'false';
  }, []);

  const toggle = () => {
    const next = !compact;
    setCompact(next);
    document.documentElement.dataset.compact = next ? 'true' : 'false';
    try {
      localStorage.setItem('pm_compact', next ? '1' : '0');
    } catch {
      /* noop */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={compact}
      className={`btn-ghost h-10 px-3 text-sm ${compact ? 'border-orange-600/60 text-orange-300' : ''}`}
    >
      {compact ? comfortableLabel : compactLabel}
    </button>
  );
}

import type { ReactNode } from 'react';

export function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={`px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className = '',
  colSpan
}: {
  children?: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`px-3 py-2.5 align-middle text-sm text-zinc-300 ${className}`}>
      {children}
    </td>
  );
}

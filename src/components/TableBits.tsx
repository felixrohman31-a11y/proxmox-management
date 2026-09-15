import type { ReactNode } from 'react';

export function Th({
  children,
  className = '',
  onClick,
  colKey,
  onResize
}: {
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
  colKey?: string;
  onResize?: (key: string, e: React.MouseEvent) => void;
}) {
  return (
    <th
      onClick={onClick}
      className={`px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 ${colKey ? 'relative ' : ''}${className}`}
    >
      {children}
      {colKey && onResize && (
        <span
          role="separator"
          aria-orientation="vertical"
          onMouseDown={(e) => onResize(colKey, e)}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-orange-500/40"
        />
      )}
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

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArchiveIcon,
  ChartIcon,
  CubeIcon,
  GearIcon,
  GridIcon,
  LayersIcon,
  LogoutIcon,
  PlusIcon
} from './icons';
import { useL, useLocale, setLangCookie } from './lang-context';

function isActive(pathname: string, href: string): boolean {
  return href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  window.location.href = '/login';
}

export function Sidebar({ username }: { username: string }) {
  const pathname = usePathname();
  const L = useL();

  const NAV = [
    { href: '/dashboard', label: L.nav.overview, icon: GridIcon },
    { href: '/dashboard/vms', label: L.nav.vms, icon: CubeIcon },
    { href: '/dashboard/create', label: L.nav.create, icon: PlusIcon },
    { href: '/dashboard/backup', label: L.nav.backup, icon: ArchiveIcon },
    { href: '/dashboard/graphs', label: L.nav.graphs, icon: ChartIcon },
    { href: '/dashboard/clusters', label: L.nav.clusters, icon: LayersIcon },
    { href: '/dashboard/settings', label: L.nav.settings, icon: GearIcon }
  ];

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950/80 md:flex">
      <div className="p-4">
        <Brand />
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          const Ico = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? 'bg-orange-500/10 font-medium text-orange-400'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
              }`}
            >
              <Ico className="h-4 w-4" /> {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-2 border-t border-zinc-800 p-3">
        
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-zinc-800 text-xs font-bold uppercase text-orange-400">
              {username.slice(0, 2)}
            </span>
            <span className="truncate text-sm text-zinc-300">{username}</span>
          </div>
          <button
            onClick={logout}
            title={L.nav.logout}
            className="rounded-md p-2 text-zinc-500 transition hover:bg-zinc-900 hover:text-red-400"
          >
            <LogoutIcon />
          </button>
        </div>
      </div>
    </aside>
  );
}

export function MobileHeader({ username }: { username: string }) {
  const pathname = usePathname();
  const L = useL();

  const NAV_M = [
    { href: '/dashboard', label: L.nav.overview },
    { href: '/dashboard/vms', label: L.nav.vms },
    { href: '/dashboard/create', label: L.nav.create },
    { href: '/dashboard/backup', label: L.nav.backup },
    { href: '/dashboard/graphs', label: L.nav.graphs },
    { href: '/dashboard/clusters', label: L.nav.clusters },
    { href: '/dashboard/settings', label: L.nav.settings }
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur md:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <Brand />
        <div className="flex items-center gap-2">
          <button
            onClick={logout}
            title={L.nav.logout}
            className="rounded-md p-2 text-zinc-500 transition hover:bg-zinc-900 hover:text-red-400"
          >
            <LogoutIcon />
          </button>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
        {NAV_M.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive(pathname, item.href)
                ? 'bg-orange-500/15 text-orange-400'
                : 'text-zinc-400 hover:bg-zinc-900'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <span className="hidden">{username}</span>
    </header>
  );
}

function Brand() {
  const L = useL();
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-orange-500 to-orange-700 text-sm font-black text-white">
        PM
      </span>
      <span>
        <span className="block text-sm font-bold leading-tight text-zinc-100">{L.brand.name}</span>
        <span className="block text-[10px] uppercase tracking-wider text-zinc-500">{L.brand.tagline}</span>
      </span>
    </Link>
  );
}

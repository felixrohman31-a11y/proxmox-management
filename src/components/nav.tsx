'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType } from 'react';
import {
  ArchiveIcon,
  ChartIcon,
  CubeIcon,
  GearIcon,
  GridIcon,
  LayersIcon,
  LogoutIcon,
  PlusIcon,
  ShieldIcon,
  UsersIcon
} from './icons';
import { useL } from './lang-context';

type NavRole = 'admin' | 'viewer';

interface NavItem {
  href: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

interface NavGroup {
  key: string;
  label: string;
  adminOnly?: boolean;
  items: NavItem[];
}

function isActive(pathname: string, href: string): boolean {
  return href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  window.location.href = '/login';
}

function buildGroups(L: ReturnType<typeof useL>): NavGroup[] {
  return [
    {
      key: 'monitor',
      label: L.nav.groupMonitor,
      items: [
        { href: '/dashboard', label: L.nav.overview, icon: GridIcon },
        { href: '/dashboard/vms', label: L.nav.vms, icon: CubeIcon },
        { href: '/dashboard/graphs', label: L.nav.graphs, icon: ChartIcon },
        { href: '/dashboard/sla', label: L.nav.sla, icon: ShieldIcon }
      ]
    },
    {
      key: 'manage',
      label: L.nav.groupManage,
      adminOnly: true,
      items: [
        { href: '/dashboard/create', label: L.nav.create, icon: PlusIcon },
        { href: '/dashboard/backup', label: L.nav.backup, icon: ArchiveIcon },
        { href: '/dashboard/clusters', label: L.nav.clusters, icon: LayersIcon }
      ]
    },
    {
      key: 'system',
      label: L.nav.groupSystem,
      items: [
        { href: '/dashboard/users', label: L.nav.users, icon: UsersIcon, adminOnly: true },
        { href: '/dashboard/settings', label: L.nav.settings, icon: GearIcon }
      ]
    }
  ];
}

export function Sidebar({ username, role }: { username: string; role: NavRole }) {
  const pathname = usePathname();
  const L = useL();
  const isAdmin = role === 'admin';
  const groups = buildGroups(L)
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => (isAdmin || !g.adminOnly) && (isAdmin || !it.adminOnly))
    }))
    .filter((g) => g.items.length > 0);

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950/80 md:flex">
      <div className="p-4">
        <Brand />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-1">
        {groups.map((group) => (
          <div key={group.key}>
            <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-600 first:pt-1">
              {group.label}
            </p>
            {group.items.map((item) => {
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
                  {Ico ? <Ico className="h-4 w-4" /> : null} {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="space-y-2 border-t border-zinc-800 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-zinc-800 text-xs font-bold uppercase text-orange-400">
              {username.slice(0, 2)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm text-zinc-300">{username}</span>
              <span className={`block text-[10px] font-semibold uppercase tracking-wide ${isAdmin ? 'text-orange-400/80' : 'text-zinc-500'}`}>
                {isAdmin ? L.role.admin : L.role.viewer}
              </span>
            </span>
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

export function MobileHeader({ username, role }: { username: string; role: NavRole }) {
  const pathname = usePathname();
  const L = useL();
  const isAdmin = role === 'admin';
  const groups = buildGroups(L)
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => (isAdmin || !g.adminOnly) && (isAdmin || !it.adminOnly))
    }))
    .filter((g) => g.items.length > 0);
  // Grup hanya sebagai pemisah chip horizontal: item digabung berurutan.
  const items = groups.flatMap((g) => g.items);

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
        {items.map((item) => (
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

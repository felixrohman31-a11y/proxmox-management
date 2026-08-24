import PageHeader from '@/components/PageHeader';
import { TerminalIcon } from '@/components/icons';
import { resolveCluster } from '@/lib/cluster-select';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ConsolePage({
  searchParams
}: {
  searchParams?: {
    c?: string | string[];
    node?: string | string[];
    type?: string | string[];
    vmid?: string | string[];
    name?: string | string[];
  };
}) {
  const sp = searchParams ?? {};
  const pick = (v?: string | string[]): string => (Array.isArray(v) ? v[0] ?? '' : v ?? '');
  const { cluster } = resolveCluster(sp.c);
  const node = pick(sp.node);
  const type = pick(sp.type) === 'lxc' ? 'lxc' : 'qemu';
  const vmid = /^\d+$/.test(pick(sp.vmid)) ? pick(sp.vmid) : '';
  const name = pick(sp.name);

  if (!cluster || !node || !vmid) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <TerminalIcon className="mx-auto h-10 w-10 text-zinc-600" />
        <h2 className="mt-3 text-lg font-medium text-zinc-200">Parameter konsol tidak lengkap</h2>
        <p className="mt-1 text-sm text-zinc-500">Buka kembali dari menu Virtual Machines.</p>
        <Link href="/dashboard/vms" className="btn-primary mt-5">
          Kembali
        </Link>
      </div>
    );
  }

  const base = `https://${cluster.host}:${cluster.port}`;
  const guiLogin = `${base}/`;
  const kind = type === 'qemu' ? 'kvm' : 'lxc';
  const novnc =
    `${base}/?console=${kind}&novnc=1&vmid=${vmid}` +
    `&vmname=${encodeURIComponent(name)}&node=${encodeURIComponent(node)}`;

  return (
    <>
      <PageHeader title="Buka Konsol" subtitle={`${type === 'qemu' ? 'VM' : 'CT'} ${vmid} · ${name} @ ${node}`} />
      <div className="card mx-auto max-w-xl space-y-4 p-6">
        <p className="text-sm leading-relaxed text-zinc-400">
          Konsol noVNC disajikan langsung oleh web UI Proxmox. Karena panel dan Proxmox berada di alamat berbeda,
          Anda perlu <b className="text-zinc-200">login satu kali</b> di web Proxmox terlebih dahulu (sesi berlaku ±2
          jam).
        </p>

        <ol className="space-y-3 text-sm">
          <li className="flex gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-orange-500/15 text-xs font-bold text-orange-400">
              1
            </span>
            <div>
              <p className="text-zinc-300">Login ke web UI Proxmox</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                Jika muncul peringatan sertifikat, pilih <i>Advanced → Proceed</i>.
              </p>
              <a href={guiLogin} target="_blank" rel="noreferrer" className="btn-primary mt-2 inline-flex">
                Buka &amp; Login ({cluster.host})
              </a>
            </div>
          </li>
          <li className="flex gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-orange-500/15 text-xs font-bold text-orange-400">
              2
            </span>
            <div>
              <p className="text-zinc-300">Buka konsol noVNC guest ini</p>
              <p className="mt-0.5 text-xs text-zinc-500">Pastikan langkah 1 sudah selesai agar tidak 401.</p>
              <a href={novnc} target="_blank" rel="noreferrer" className="btn-primary mt-2 inline-flex">
                Buka Konsol noVNC
              </a>
            </div>
          </li>
        </ol>

        <p className="text-xs text-zinc-600">
          Tips: setelah login di langkah 1, tab yang sama juga bisa dipakai mengelola guest secara manual.
        </p>
      </div>
    </>
  );
}

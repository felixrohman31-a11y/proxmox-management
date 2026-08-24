'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertIcon, RefreshIcon } from './icons';
import type { CreateMeta } from '@/types';

interface Props {
  clusterId: string;
  nodes: { node: string; status: string }[];
}

type Phase = { label: string } | null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fileNameFromUrl(u: string): string {
  try {
    const p = new URL(u);
    let n = decodeURIComponent(p.pathname.split('/').pop() ?? '');
    n = n.replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!n) return '';
    return n.toLowerCase().endsWith('.iso') ? n : n + '.iso';
  } catch {
    return '';
  }
}

export default function CreateGuestForm({ clusterId, nodes }: Props) {
  const router = useRouter();
  const [type, setType] = useState<'ct' | 'vm'>('ct');
  const [node, setNode] = useState(() => nodes.find((n) => n.status === 'online')?.node ?? nodes[0]?.node ?? '');
  const [meta, setMeta] = useState<CreateMeta | null>(null);
  const [metaErr, setMetaErr] = useState<string | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);

  const [vmid, setVmid] = useState('');
  const [hostname, setHostname] = useState('');
  const [cores, setCores] = useState('2');
  const [memory, setMemory] = useState('2048');
  const [swap, setSwap] = useState('512');
  const [diskGb, setDiskGb] = useState('20');
  const [storage, setStorage] = useState('');
  const [bridge, setBridge] = useState('');
  const [lxcTemplate, setLxcTemplate] = useState('');
  const [vmTemplate, setVmTemplate] = useState('');
  const [installMode, setInstallMode] = useState<'clone' | 'iso'>('iso');
  const [isoVolid, setIsoVolid] = useState('');
  const [ipMode, setIpMode] = useState<'dhcp' | 'static'>('dhcp');
  const [ipCidr, setIpCidr] = useState('');
  const [gateway, setGateway] = useState('');
  const [rootPassword, setRootPassword] = useState('');
  const [ciEnabled, setCiEnabled] = useState(false);
  const [ciUser, setCiUser] = useState('');
  const [ciPassword, setCiPassword] = useState('');
  const [autoStart, setAutoStart] = useState(true);

  const [dlStorage, setDlStorage] = useState('');
  const [dlUrl, setDlUrl] = useState('');

  const [phase, setPhase] = useState<Phase>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const loadMeta = useCallback(async () => {
    if (!node) return;
    setMetaLoading(true);
    setMetaErr(null);
    try {
      const r = await fetch(`/api/meta/${clusterId}/${encodeURIComponent(node)}`);
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.data) {
        setMetaErr(j?.error ?? `Gagal memuat metadata (HTTP ${r.status}).`);
        return;
      }
      const m = j.data as CreateMeta;
      setMeta(m);
      setVmid((v) => v || m.nextId);
      setStorage((s) => s || (type === 'ct' ? (m.ctStorages[0] ?? '') : (m.vmStorages[0] ?? '')));
      setBridge((b) => b || (m.bridges[0]?.iface ?? ''));
      if (type === 'ct') setLxcTemplate((t) => t || (m.lxcTemplates[0]?.volid ?? ''));
      else {
        setVmTemplate((t) => t || String(m.vmTemplates[0]?.vmid ?? ''));
        setIsoVolid((x) => x || (m.isos[0]?.volid ?? ''));
        setDlStorage((d) => d || (m.isoStorages[0] ?? ''));
      }
    } catch (e) {
      setMetaErr((e as Error).message);
    } finally {
      setMetaLoading(false);
    }
  }, [clusterId, node, type]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  function switchType(t: 'ct' | 'vm') {
    setType(t);
    setStorage('');
    setLxcTemplate('');
    setVmTemplate('');
  }

  async function awaitTask(n: string, upid: string, label: string): Promise<void> {
    for (let i = 0; i < 300; i++) {
      await sleep(2000);
      try {
        const r = await fetch(
          `/api/pve/${clusterId}/nodes/${encodeURIComponent(n)}/tasks/${encodeURIComponent(upid)}/status`
        );
        const j = await r.json().catch(() => null);
        const d = (j?.data ?? {}) as { status?: string; exitstatus?: string };
        const finished = d.exitstatus !== undefined || d.status === 'stopped';
        if (!finished) continue;
        const ok = String(d.exitstatus ?? '')
          .toUpperCase()
          .includes('OK');
        if (!ok) throw Object.assign(new Error(`${label} gagal: ${d.exitstatus ?? 'unknown'}`), { fatal: true });
        return;
      } catch (e) {
        if ((e as Error & { fatal?: boolean }).fatal) throw e;
      }
    }
    throw new Error(`${label}: timeout menunggu task Proxmox.`);
  }

  function validate(): string | null {
    if (!node) return 'Pilih node terlebih dahulu.';
    if (!meta) return 'Metadata node belum termuat.';
    const vid = Number(vmid);
    if (!vid || vid < 100) return 'VMID harus angka >= 100.';
    if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(hostname)) return 'Hostname tidak valid (huruf/angka/titik/strip).';
    if (type === 'ct' && !lxcTemplate) return 'Pilih template CT.';
    if (type === 'ct' && !storage) return 'Pilih storage root.';
    if (Number(diskGb) < 1) return 'Ukuran disk minimal 1 GB.';
    if (!bridge) return 'Pilih bridge.';
    if (ipMode === 'static' && !/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(ipCidr))
      return 'Format IP tidak valid. Contoh: 192.168.100.50/24';
    if (type === 'vm' && installMode === 'clone' && !vmTemplate)
      return 'Belum ada template VM — gunakan metode ISO atau clone dari cluster lain.';
    if (type === 'vm' && installMode === 'iso' && !isoVolid) return 'Pilih file ISO terlebih dahulu.';
    if (type === 'vm' && installMode === 'iso' && !storage) return 'Pilih storage disk.';
    return null;
  }

  async function downloadIso() {
    setFormError(null);
    if (!/^https?:\/\//.test(dlUrl)) {
      setFormError('URL harus diawali http:// atau https://');
      return;
    }
    if (!dlStorage) {
      setFormError('Pilih storage tujuan ISO.');
      return;
    }
    const filename = fileNameFromUrl(dlUrl);
    if (!filename) {
      setFormError('Tidak bisa menentukan nama file dari URL.');
      return;
    }
    try {
      setPhase({ label: `Mengunduh ${filename} ke ${dlStorage}… (bergantung kecepatan server sumber)` });
      const r = await fetch(
        `/api/pve/${clusterId}/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(dlStorage)}/download-url`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: dlUrl, filename, content: 'iso' }) }
      );
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.data) throw new Error(j?.error ?? `Gagal memulai unduhan (HTTP ${r.status}).`);
      const upid = String(j.data);
      if (!upid.startsWith('UPID:')) throw new Error('Respons task tidak valid.');
      await awaitTask(node, upid, `Unduh ${filename}`);
      setDoneMsg(`ISO ${filename} berhasil diunduh ke ${dlStorage}.`);
      setDlUrl('');
      await loadMeta();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setPhase(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setDoneMsg(null);

    const vErr = validate();
    if (vErr) {
      setFormError(vErr);
      return;
    }
    const vid = Number(vmid);

    try {
      let net0: string;
      if (ipMode === 'dhcp') net0 = `name=eth0,bridge=${bridge},ip=dhcp`;
      else net0 = `name=eth0,bridge=${bridge},ip=${ipCidr},gw=${gateway}`;

      if (type === 'ct') {
        setPhase({ label: `Membuat CT ${vid} di ${node}…` });
        const body: Record<string, unknown> = {
          vmid: vid,
          hostname,
          cores: Number(cores),
          memory: Number(memory),
          swap: Number(swap),
          rootfs: `${storage}:${Number(diskGb)}`,
          ostemplate: lxcTemplate,
          net0,
          unprivileged: 1,
          start: autoStart ? 1 : 0,
          description: 'Dibuat via ProxCenter'
        };
        if (rootPassword) body.password = rootPassword;
        const r = await fetch(`/api/pve/${clusterId}/nodes/${encodeURIComponent(node)}/lxc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.data) throw new Error(j?.error ?? `Gagal membuat CT (HTTP ${r.status}).`);
        const upid = String(j.data);
        if (upid.startsWith('UPID:')) {
          setPhase({ label: `Task pembuatan CT ${vid} berjalan…` });
          await awaitTask(node, upid, `Create CT ${vid}`);
        }
        setDoneMsg(`CT ${vid} (${hostname}) berhasil dibuat di node ${node}.`);
      } else if (installMode === 'iso') {
        setPhase({ label: `Membuat VM ${vid} dengan installer ${hostname ? '' : ''}ISO…` });
        const body: Record<string, unknown> = {
          vmid: vid,
          name: hostname,
          cores: Number(cores),
          memory: Number(memory),
          ostype: 'l26',
          scsihw: 'virtio-scsi-single',
          scsi0: `${storage}:${Number(diskGb)},discard=on`,
          net0: `virtio,bridge=${bridge}`,
          ide2: `${isoVolid},media=cdrom`,
          boot: 'order=scsi0;ide2',
          agent: 1,
          description: 'Dibuat via ProxCenter'
        };
        const r = await fetch(`/api/pve/${clusterId}/nodes/${encodeURIComponent(node)}/qemu`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error ?? `Gagal membuat VM (HTTP ${r.status}).`);

        if (autoStart) {
          setPhase({ label: `Menjalankan VM ${vid} — lanjutkan instalasi OS via konsol…` });
          const rs = await fetch(
            `/api/pve/${clusterId}/nodes/${encodeURIComponent(node)}/qemu/${vid}/status/start`,
            { method: 'POST' }
          );
          const js = await rs.json().catch(() => null);
          if (!rs.ok) throw new Error(js?.error ?? `Start VM gagal (HTTP ${rs.status}).`);
          const startUpid = String(js?.data ?? '');
          if (startUpid.startsWith('UPID:')) await awaitTask(node, startUpid, `Start VM ${vid}`);
        }
        setDoneMsg(`VM ${vid} (${hostname}) dibuat & booting dari ISO. Buka menu Virtual Machines → tombol konsol untuk instalasi OS.`);
      } else {
        const tplId = Number(vmTemplate);
        setPhase({ label: `Cloning template ${tplId} → ${vid}…` });
        const cloneBody: Record<string, unknown> = {
          newid: vid,
          name: hostname,
          full: 1,
          target: node
        };
        if (storage) cloneBody.storage = storage;
        const rc = await fetch(`/api/pve/${clusterId}/nodes/${encodeURIComponent(node)}/qemu/${tplId}/clone`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cloneBody)
        });
        const jc = await rc.json().catch(() => null);
        if (!rc.ok || !jc?.data) throw new Error(jc?.error ?? `Clone gagal (HTTP ${rc.status}).`);
        const cloneUpid = String(jc.data);
        if (cloneUpid.startsWith('UPID:')) {
          setPhase({ label: `Task clone berjalan…` });
          await awaitTask(node, cloneUpid, `Clone ke ${vid}`);
        }

        setPhase({ label: `Menerapkan konfigurasi (core/RAM/net)…` });
        const cfg: Record<string, unknown> = {
          cores: Number(cores),
          memory: Number(memory)
        };
        if (ciEnabled) {
          cfg.ipconfig0 = ipMode === 'dhcp' ? 'ip=dhcp' : `ip=${ipCidr},gw=${gateway}`;
          if (ciUser) cfg.ciuser = ciUser;
          if (ciPassword) cfg.cipassword = ciPassword;
        }
        const ru = await fetch(`/api/pve/${clusterId}/nodes/${encodeURIComponent(node)}/qemu/${vid}/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cfg)
        });
        const ju = await ru.json().catch(() => null);
        if (!ru.ok) throw new Error(ju?.error ?? `Update config gagal (HTTP ${ru.status}).`);

        if (autoStart) {
          setPhase({ label: `Menjalankan VM ${vid}…` });
          const rs = await fetch(
            `/api/pve/${clusterId}/nodes/${encodeURIComponent(node)}/qemu/${vid}/status/start`,
            { method: 'POST' }
          );
          const jsn = await rs.json().catch(() => null);
          if (!rs.ok) throw new Error(jsn?.error ?? `Start VM gagal (HTTP ${rs.status}).`);
          const startUpid = String(jsn?.data ?? '');
          if (startUpid.startsWith('UPID:')) await awaitTask(node, startUpid, `Start VM ${vid}`);
        }
        setDoneMsg(`VM ${vid} (${hostname}) berhasil dibuat dari template ${tplId}.`);
      }

      setPhase(null);
      router.refresh();
    } catch (err) {
      setPhase(null);
      setFormError((err as Error).message);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-5 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Tipe Guest</label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['ct', 'Container (CT)'],
                ['vm', 'Virtual Machine']
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => switchType(val)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  type === val
                    ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                    : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Node</label>
          <select className="input" value={node} onChange={(e) => setNode(e.target.value)}>
            {nodes.map((n) => (
              <option key={n.node} value={n.node} disabled={n.status !== 'online'}>
                {n.node}
                {n.status !== 'online' ? ` (${n.status})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {metaLoading && (
        <p className="flex items-center gap-2 text-sm text-zinc-500">
          <RefreshIcon className="h-4 w-4 animate-spin" /> Memuat metadata node…
        </p>
      )}
      {metaErr && (
        <p className="flex items-start gap-1.5 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" /> {metaErr}
        </p>
      )}

      {meta && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label">VMID</label>
              <input className="input" value={vmid} onChange={(e) => setVmid(e.target.value)} />
            </div>
            <div>
              <label className="label">Hostname / Name</label>
              <input
                className="input"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="web-prod-01"
              />
            </div>
            <div>
              <label className="label">Cores</label>
              <input className="input" value={cores} onChange={(e) => setCores(e.target.value)} />
            </div>
            <div>
              <label className="label">Memori (MB)</label>
              <input className="input" value={memory} onChange={(e) => setMemory(e.target.value)} />
            </div>
          </div>

          {type === 'ct' ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="label">Template CT</label>
                <select className="input" value={lxcTemplate} onChange={(e) => setLxcTemplate(e.target.value)}>
                  {meta.lxcTemplates.length === 0 && <option value="">— tidak ada template —</option>}
                  {meta.lxcTemplates.map((t) => (
                    <option key={t.volid} value={t.volid}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Storage Root</label>
                <select className="input" value={storage} onChange={(e) => setStorage(e.target.value)}>
                  {meta.ctStorages.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Disk (GB)</label>
                <input className="input" value={diskGb} onChange={(e) => setDiskGb(e.target.value)} />
              </div>
              <div>
                <label className="label">Swap (MB)</label>
                <input className="input" value={swap} onChange={(e) => setSwap(e.target.value)} />
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="label">Metode Instalasi</label>
                <div className="grid grid-cols-2 gap-2 sm:max-w-md">
                  {(
                    [
                      ['iso', 'ISO / Image File'],
                      ['clone', 'Clone VM Template']
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setInstallMode(val)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                        installMode === val
                          ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                          : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {installMode === 'clone' ? (
                  <div>
                    <label className="label">VM Template (sumber)</label>
                    <select className="input" value={vmTemplate} onChange={(e) => setVmTemplate(e.target.value)}>
                      {meta.vmTemplates.length === 0 && <option value="">— belum ada template VM —</option>}
                      {meta.vmTemplates.map((t) => (
                        <option key={t.vmid} value={String(t.vmid)}>
                          {t.vmid} · {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="lg:col-span-2">
                    <label className="label">File ISO (cdrom)</label>
                    <select className="input" value={isoVolid} onChange={(e) => setIsoVolid(e.target.value)}>
                      {meta.isos.length === 0 && <option value="">— belum ada ISO — unduh di bawah —</option>}
                      {meta.isos.map((i) => (
                        <option key={i.volid} value={i.volid}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="label">Storage Disk</label>
                  <select className="input" value={storage} onChange={(e) => setStorage(e.target.value)}>
                    {meta.vmStorages.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">{installMode === 'clone' ? 'Disk (GB, full clone)' : 'Disk (GB)'}</label>
                  <input className="input" value={diskGb} onChange={(e) => setDiskGb(e.target.value)} disabled={installMode === 'clone'} />
                </div>
              </div>

              {installMode === 'iso' && (
                <fieldset className="rounded-xl border border-zinc-800 p-4">
                  <legend className="px-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Unduh ISO baru dari URL (server PVE mengunduh langsung)
                  </legend>
                  <div className="space-y-3">
                    <input
                      className="input"
                      value={dlUrl}
                      onChange={(e) => setDlUrl(e.target.value)}
                      placeholder="https://download.debian.org/debian-cd/current/amd64/iso-cd/debian-12.x-amd64-netinst.iso"
                    />
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="w-56">
                        <label className="label">Storage Tujuan</label>
                        <select className="input" value={dlStorage} onChange={(e) => setDlStorage(e.target.value)}>
                          {meta.isoStorages.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button type="button" className="btn-ghost" onClick={downloadIso} disabled={Boolean(phase) || !dlUrl}>
                        Unduh ISO
                      </button>
                      {dlUrl && (
                        <span className="text-xs text-zinc-600">
                          simpan sebagai: <code>{fileNameFromUrl(dlUrl) || '?'}</code>
                        </span>
                      )}
                    </div>
                  </div>
                </fieldset>
              )}
            </>
          )}

          <fieldset className="rounded-xl border border-zinc-800 p-4">
            <legend className="px-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Jaringan</legend>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="label">Bridge</label>
                <select className="input" value={bridge} onChange={(e) => setBridge(e.target.value)}>
                  {meta.bridges.length === 0 && <option value="">— tidak ada bridge —</option>}
                  {meta.bridges.map((b) => (
                    <option key={b.iface} value={b.iface}>
                      {b.iface}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Mode IP</label>
                <select
                  className="input"
                  value={ipMode}
                  onChange={(e) => setIpMode(e.target.value as 'dhcp' | 'static')}
                >
                  <option value="dhcp">DHCP</option>
                  <option value="static">Static</option>
                </select>
              </div>
              {ipMode === 'static' && (
                <>
                  <div>
                    <label className="label">IP / Prefix</label>
                    <input
                      className="input"
                      value={ipCidr}
                      onChange={(e) => setIpCidr(e.target.value)}
                      placeholder="192.168.100.50/24"
                    />
                  </div>
                  <div>
                    <label className="label">Gateway</label>
                    <input
                      className="input"
                      value={gateway}
                      onChange={(e) => setGateway(e.target.value)}
                      placeholder="192.168.100.1"
                    />
                  </div>
                </>
              )}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-600">
              Catatan: static IP untuk VM ISO berlaku setelah OS terinstal bila mendukung cloud-init/reproses; CT
              langsung aktif.
            </p>
          </fieldset>

          {type === 'ct' && (
            <div className="sm:w-1/2">
              <label className="label">Password root CT (opsional)</label>
              <input
                type="password"
                className="input"
                value={rootPassword}
                onChange={(e) => setRootPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          )}

          {type === 'vm' && installMode === 'clone' && (
            <fieldset className="rounded-xl border border-zinc-800 p-4">
              <legend className="px-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Cloud-init (opsional)
              </legend>
              <label className="mb-3 flex items-center gap-2 text-sm text-zinc-400">
                <input
                  type="checkbox"
                  checked={ciEnabled}
                  onChange={(e) => setCiEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-orange-600"
                />
                Terapkan cloud-init pada VM hasil clone
              </label>
              {ciEnabled && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="label">CI User</label>
                    <input className="input" value={ciUser} onChange={(e) => setCiUser(e.target.value)} placeholder="root" />
                  </div>
                  <div>
                    <label className="label">CI Password</label>
                    <input
                      type="password"
                      className="input"
                      value={ciPassword}
                      onChange={(e) => setCiPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                  <p className="self-end text-xs leading-relaxed text-zinc-600">
                    Butuh drive cloud-init pada template. Mode IP mengikuti pilihan jaringan di atas.
                  </p>
                </div>
              )}
            </fieldset>
          )}

          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <input
              type="checkbox"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-orange-600"
            />
            {type === 'vm' && installMode === 'iso'
              ? 'Boot VM dari ISO setelah dibuat (lanjutkan instalasi via konsol)'
              : 'Jalankan guest setelah selesai dibuat'}
          </label>
        </>
      )}

      {formError && (
        <p className="flex items-start gap-1.5 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" /> {formError}
        </p>
      )}
      {doneMsg && (
        <p className="rounded-lg border border-emerald-800/60 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
          {doneMsg}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={Boolean(phase) || metaLoading}>
          Buat {type === 'ct' ? 'Container' : 'VM'}
        </button>
        {phase && (
          <span className="flex items-center gap-2 text-sm text-zinc-400">
            <RefreshIcon className="h-4 w-4 animate-spin" /> {phase.label}
          </span>
        )}
      </div>
    </form>
  );
}

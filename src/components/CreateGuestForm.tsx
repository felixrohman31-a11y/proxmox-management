'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertIcon, RefreshIcon } from './icons';
import type { CreateMeta } from '@/types';

interface Props {
  clusterId: string;
  nodes: { node: string; status: string }[];
}

type Phase = { label: string; busy: true } | null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  const [memory, setMemory] = useState('1024');
  const [swap, setSwap] = useState('512');
  const [diskGb, setDiskGb] = useState('8');
  const [storage, setStorage] = useState('');
  const [bridge, setBridge] = useState('');
  const [lxcTemplate, setLxcTemplate] = useState('');
  const [vmTemplate, setVmTemplate] = useState('');
  const [ipMode, setIpMode] = useState<'dhcp' | 'static'>('dhcp');
  const [ipCidr, setIpCidr] = useState('');
  const [gateway, setGateway] = useState('');
  const [rootPassword, setRootPassword] = useState('');
  const [ciEnabled, setCiEnabled] = useState(false);
  const [ciUser, setCiUser] = useState('');
  const [ciPassword, setCiPassword] = useState('');
  const [autoStart, setAutoStart] = useState(true);

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
      else setVmTemplate((t) => t || String(m.vmTemplates[0]?.vmid ?? ''));
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
    for (let i = 0; i < 150; i++) {
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setDoneMsg(null);

    if (!node) return setFormError('Pilih node terlebih dahulu.');
    if (!meta) return setFormError('Metadata node belum termuat.');
    const vid = Number(vmid);
    if (!vid || vid < 100) return setFormError('VMID harus angka >= 100.');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(hostname)) return setFormError('Hostname tidak valid (huruf/angka/titik/strip).');
    if (type === 'ct' && !lxcTemplate) return setFormError('Pilih template CT.');
    if (type === 'vm' && !vmTemplate) return setFormError('Tidak ada template VM — clone butuh VM template di cluster.');
    if (!storage) return setFormError('Pilih storage.');
    if (!bridge) return setFormError('Pilih bridge.');
    if (ipMode === 'static' && !/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(ipCidr))
      return setFormError('Format IP tidak valid. Contoh: 192.168.100.50/24');

    try {
      let net0: string;
      if (ipMode === 'dhcp') net0 = `name=eth0,bridge=${bridge},ip=dhcp`;
      else net0 = `name=eth0,bridge=${bridge},ip=${ipCidr},gw=${gateway}`;

      if (type === 'ct') {
        setPhase({ label: `Membuat CT ${vid} di ${node}…`, busy: true });
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
          setPhase({ label: `Task pembuatan CT ${vid} berjalan…`, busy: true });
          await awaitTask(node, upid, `Create CT ${vid}`);
        }
        setDoneMsg(`CT ${vid} (${hostname}) berhasil dibuat di node ${node}.`);
      } else {
        const tplId = Number(vmTemplate);
        setPhase({ label: `Cloning template ${tplId} → ${vid}…`, busy: true });
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
          setPhase({ label: `Task clone berjalan…`, busy: true });
          await awaitTask(node, cloneUpid, `Clone ke ${vid}`);
        }

        setPhase({ label: `Menerapkan konfigurasi (core/RAM/net)…`, busy: true });
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
          setPhase({ label: `Menjalankan VM ${vid}…`, busy: true });
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

  const inputCls = 'input';

  return (
    <form onSubmit={submit} className="card space-y-5 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Tipe Guest</label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['ct', 'Container (CT)'],
                ['vm', 'VM (clone template)']
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
          <select className={inputCls} value={node} onChange={(e) => setNode(e.target.value)}>
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
              <input className={inputCls} value={vmid} onChange={(e) => setVmid(e.target.value)} />
            </div>
            <div>
              <label className="label">Hostname / Name</label>
              <input
                className={inputCls}
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="web-prod-01"
              />
            </div>
            <div>
              <label className="label">Cores</label>
              <input className={inputCls} value={cores} onChange={(e) => setCores(e.target.value)} />
            </div>
            <div>
              <label className="label">Memori (MB)</label>
              <input className={inputCls} value={memory} onChange={(e) => setMemory(e.target.value)} />
            </div>
          </div>

          {type === 'ct' ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="label">Template CT</label>
                <select className={inputCls} value={lxcTemplate} onChange={(e) => setLxcTemplate(e.target.value)}>
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
                <select className={inputCls} value={storage} onChange={(e) => setStorage(e.target.value)}>
                  {meta.ctStorages.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Disk (GB)</label>
                <input className={inputCls} value={diskGb} onChange={(e) => setDiskGb(e.target.value)} />
              </div>
              <div>
                <label className="label">Swap (MB)</label>
                <input className={inputCls} value={swap} onChange={(e) => setSwap(e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="label">VM Template (clone sumber)</label>
                <select className={inputCls} value={vmTemplate} onChange={(e) => setVmTemplate(e.target.value)}>
                  {meta.vmTemplates.length === 0 && <option value="">— belum ada template VM —</option>}
                  {meta.vmTemplates.map((t) => (
                    <option key={t.vmid} value={String(t.vmid)}>
                      {t.vmid} · {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Storage Disk</label>
                <select className={inputCls} value={storage} onChange={(e) => setStorage(e.target.value)}>
                  {meta.vmStorages.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Disk (GB, full clone)</label>
                <input className={inputCls} value={diskGb} onChange={(e) => setDiskGb(e.target.value)} disabled />
              </div>
            </div>
          )}

          <fieldset className="rounded-xl border border-zinc-800 p-4">
            <legend className="px-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Jaringan</legend>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="label">Bridge</label>
                <select className={inputCls} value={bridge} onChange={(e) => setBridge(e.target.value)}>
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
                  className={inputCls}
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
                      className={inputCls}
                      value={ipCidr}
                      onChange={(e) => setIpCidr(e.target.value)}
                      placeholder="192.168.100.50/24"
                    />
                  </div>
                  <div>
                    <label className="label">Gateway</label>
                    <input
                      className={inputCls}
                      value={gateway}
                      onChange={(e) => setGateway(e.target.value)}
                      placeholder="192.168.100.1"
                    />
                  </div>
                </>
              )}
            </div>
          </fieldset>

          {type === 'ct' && (
            <div className="sm:w-1/2">
              <label className="label">Password root CT (opsional)</label>
              <input
                type="password"
                className={inputCls}
                value={rootPassword}
                onChange={(e) => setRootPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          )}

          {type === 'vm' && (
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
                    <input className={inputCls} value={ciUser} onChange={(e) => setCiUser(e.target.value)} placeholder="root" />
                  </div>
                  <div>
                    <label className="label">CI Password</label>
                    <input
                      type="password"
                      className={inputCls}
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
            Jalankan guest setelah selesai dibuat
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

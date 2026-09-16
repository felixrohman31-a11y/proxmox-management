import fs from 'fs/promises';
import path from 'path';
import { ensureDataDir } from './secrets';
import { listClustersSync } from './store';
import { appendAudit } from './audit';
import { sendNotification, getWaConfig, getSlaAlertConfig } from './ftp-backup';
import { slaForCluster, fmtDowntime, type ClusterSla, type SlaRow } from './sla';
import {
  buildSnapshot,
  upsertMany,
  upsertSnapshot,
  isClosedPeriod,
  type SlaSnapshot
} from './sla-history';

/**
 * Siklus monitor SLA (WhatsApp/Telegram alert + histori tren).
 *
 * Setiap siklus (default 30 menit) SLA bulan berjalan dihitung per cluster dan
 * SELALU disimpan sebagai snapshot histori (lihat sla-history.ts) — sehingga
 * tren antar-bulan terbangun otomatis bahkan saat notifikasi mati. Saat bulan
 * berganti, snapshot bulan sebelumnya membeku pada pengambilan terakhir = nilai
 * final. Selain itu, entitas yang BARU melanggar (transisi menjadi breach, atau
 * breach di periode bulan baru) dilaporkan sekali via WA/Telegram — tidak diulang
 * selamanya selama statusnya tetap breach. State dikirim ke file agar tidak spam
 * setelah restart pada periode yang sama. Downtime dalam jendela maintenance
 * sudah dikecualikan lebih dulu (sla.ts) sehingga tidak memicu alert murni
 * terjadwal.
 */

const STATE_FILE = 'sla-alert-state.json';

interface Entry {
  status: string;
  period: string; // "YYYY-M"
  notifiedAt: number;
}
type SlaAlertState = Record<string, Record<string, Entry>>;

function statePath(): string {
  return path.join(ensureDataDir(), STATE_FILE);
}

async function readState(): Promise<SlaAlertState> {
  try {
    return JSON.parse(await fs.readFile(statePath(), 'utf8')) as SlaAlertState;
  } catch {
    return {};
  }
}
async function writeState(s: SlaAlertState): Promise<void> {
  await fs.writeFile(statePath(), JSON.stringify(s, null, 2), { encoding: 'utf8', mode: 0o600 });
}

function wibYm(): { y: number; m: number } {
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  return { y: wib.getUTCFullYear(), m: wib.getUTCMonth() + 1 };
}

function formatSlaAlert(clusterName: string, y: number, m: number, rows: SlaRow[]): string {
  const period = `${String(m).padStart(2, '0')}/${y}`;
  const lines = rows.slice(0, 10).map((r) => {
    const who = r.kind === 'node' ? `NODE @${r.node}` : `${r.type}/${r.vmid} @${r.node}`;
    const dt = r.downtimeMin != null ? fmtDowntime(r.downtimeMin, false) : '-';
    return `• ${r.name} (${who}) — ${r.actualPct}% (target ${r.target}%), downtime ${dt}`;
  });
  const more = rows.length > 10 ? `\n… +${rows.length - 10} lainnya` : '';
  const when = new Date().toLocaleString('id-ID', { hour12: false });
  return `🔴 SLA BREACH — ${clusterName}\nPeriode ${period}\n${lines.join('\n')}${more}\nWaktu: ${when} WIB`;
}

export interface SlaCycleResult {
  clusters: number;
  alerts: number;
  sent: boolean;
  captured: number;
  notified: boolean;
  message?: string;
}

/**
 * Satu siklus: hitung SLA bulan berjalan → simpan histori (selalu) →
 * kirim alert untuk breach baru (hanya bila WA siap & alert aktif / manual).
 */
export async function runSlaCycle(manual = false): Promise<SlaCycleResult> {
  const wa = await getWaConfig();
  const cfg = await getSlaAlertConfig();
  const notify = wa.hasSecret && (cfg.enabled || manual);

  const { y, m } = wibYm();
  const period = `${y}-${m}`;
  const clusters = listClustersSync();
  const snaps: SlaSnapshot[] = [];
  const state = await readState();
  let alertsTotal = 0;
  let lastSendMsg = '';

  for (const cluster of clusters) {
    let sla: ClusterSla;
    try {
      sla = await slaForCluster(cluster, y, m);
    } catch {
      continue; // cluster mati/error → lewati, jangan spam
    }
    snaps.push(buildSnapshot(sla, cluster.name, y, m, isClosedPeriod(y, m)));

    if (!notify) continue;

    const prevByCluster = state[cluster.id] ?? {};
    const nextByCluster: Record<string, Entry> = {};
    const newly: SlaRow[] = [];

    for (const r of [...sla.nodes, ...sla.guests]) {
      const prev = prevByCluster[r.key];
      const breached = r.status === 'breach';
      if (breached && (!prev || prev.period !== period || prev.status !== 'breach')) {
        newly.push(r);
      }
      nextByCluster[r.key] = { status: r.status, period, notifiedAt: breached ? Date.now() : 0 };
    }
    state[cluster.id] = nextByCluster;

    if (newly.length) {
      const msg = formatSlaAlert(cluster.name, y, m, newly);
      const res = await sendNotification(msg);
      lastSendMsg = res.message;
      alertsTotal += newly.length;
      await appendAudit({
        ts: new Date().toISOString(),
        user: 'monitor',
        action: res.ok ? 'notify.sla.breach' : 'notify.sla.breach.gagal',
        target: `${cluster.name}: ${newly.map((r) => r.name).join(', ').slice(0, 120)}`,
        detail: res.message
      });
    }
  }

  const captured = await upsertMany(snaps);
  if (notify) await writeState(state);

  const message =
    alertsTotal > 0
      ? lastSendMsg
      : notify
        ? 'Tidak ada pelanggaran baru.'
        : wa.hasSecret
          ? 'Alert SLA dinonaktifkan.'
          : 'Notifikasi belum dikonfigurasi — histori tetap tersimpan.';

  return {
    clusters: clusters.length,
    alerts: alertsTotal,
    sent: alertsTotal > 0,
    captured,
    notified: notify,
    message
  };
}

/** Ambil/menambal snapshot untuk satu cluster & satu bulan kalender (manual). */
export async function captureClusterSnapshot(
  clusterId: string,
  y: number,
  m: number
): Promise<{ ok: boolean; snap?: SlaSnapshot; reason?: string }> {
  const cluster = listClustersSync().find((c) => c.id === clusterId);
  if (!cluster) return { ok: false, reason: 'cluster_not_found' };
  let sla: ClusterSla;
  try {
    sla = await slaForCluster(cluster, y, m);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'compute_failed' };
  }
  const snap = buildSnapshot(sla, cluster.name, y, m, isClosedPeriod(y, m));
  const stored = await upsertSnapshot(snap, { force: true });
  return { ok: stored, snap, reason: stored ? undefined : 'no_data' };
}

// Scheduler mandiri (dipanggil dari halaman/route SLA), terpisah dari scheduler
// backup agar tidak terjadi circular import. Menggerakkan histori + alert.
let started = false;
export function ensureSlaScheduler(): void {
  if (started) return;
  started = true;
  // Jalankan sekali segera (±30 dtk) agar histori mulai terisi tanpa menunggu
  // interval penuh, lalu tiap 30 menit.
  setTimeout(
    () => {
      void runSlaCycle().catch(() => {});
    },
    30 * 1000
  ).unref?.();
  setInterval(
    () => {
      void runSlaCycle().catch(() => {});
    },
    30 * 60 * 1000
  ).unref?.();
}

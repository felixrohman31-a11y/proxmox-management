import { getPveClient, PveError } from './pve';
import { readAudit } from './audit';
import type { PublicCluster } from '@/types';

interface Res {
  type?: string;
  node?: string;
  name?: string;
  vmid?: number;
  status?: string;
  template?: number | boolean;
  cpu?: number;
  maxcpu?: number;
  mem?: number;
  maxmem?: number;
  uptime?: number;
}

interface StorageRow {
  storage?: string;
  type?: string;
  active?: number | boolean;
  total?: number;
  used?: number;
}

const GIB = 1024 ** 3;

function fmtGiB(bytes?: number | null): string {
  if (bytes == null || !isFinite(bytes)) return '-';
  return `${(bytes / GIB).toFixed(1)} GB`;
}

function fmtPct(part?: number | null, total?: number | null): string {
  if (!part && part !== 0) return '-';
  if (!total) return '-';
  return `${Math.round((part / total) * 100)}%`;
}

function kategori(pct: number): string {
  if (pct >= 85) return 'KRITIS (hampir penuh)';
  if (pct >= 70) return 'Waspada (mulai penuh)';
  return 'Aman';
}

function hariDariDetik(sec?: number): string {
  if (!sec || sec < 86400) return '< 1 hari';
  const d = Math.floor(sec / 86400);
  return `${d} hari`;
}

const BULAN = [
  '', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export async function buildMonthlyReport(
  cluster: PublicCluster,
  year: number,
  month: number
): Promise<{ filename: string; content: string }> {
  const client = getPveClient(cluster.id);
  if (!client) throw new PveError('Cluster tidak ditemukan.', 404);

  const res = ((await client.get<Res[]>('/cluster/resources').catch(() => [])) ?? []) as Res[];
  const nodes = res.filter((r) => r.type === 'node');
  const guests = res.filter((r) => r.type === 'qemu' || r.type === 'lxc');

  const nodeNames = Array.from(new Set(nodes.map((n) => n.node ?? ''))).filter(Boolean);
  const storageLists = await Promise.all(
    nodeNames.map((n) =>
      client.get<StorageRow[]>(`/nodes/${n}/storage`).catch(() => [] as StorageRow[])
    )
  );
  const seenStorage = new Set<string>();
  const storages: Array<StorageRow & { node: string }> = [];
  nodeNames.forEach((n, i) => {
    for (const s of storageLists[i]) {
      if (!s.storage || !s.active || !s.total) continue;
      const key = `${s.storage}|${[s.total, s.used].join(':')}`;
      if (seenStorage.has(key)) continue;
      seenStorage.add(key);
      storages.push({ ...s, node: n });
    }
  });

  const now = new Date();
  const startEpoch = Date.UTC(year, month - 1, 1, -7) / 1000;
  const endEpoch = Date.UTC(year, month, 1, -7) / 1000;

  const allTasks = ((await client
    .get<Array<{ starttime?: number; status?: string; type?: string }>>('/cluster/tasks')
    .catch(() => [])) ?? []) as Array<{ starttime?: number; status?: string; type?: string }>;
  const monthTasks = allTasks.filter((t) => (t.starttime ?? 0) >= startEpoch && (t.starttime ?? 0) < endEpoch);
  const failedTasks = monthTasks.filter((t) => t.status && !String(t.status).toUpperCase().includes('OK'));

  const auditMonth = (await readAudit(2000)).filter((a) => a.ts.startsWith(`${year}-${String(month).padStart(2, '0')}`));

  // ===== Ringkasan otomatis =====
  const onlineNodes = nodes.filter((n) => n.status === 'online');
  const runningGuests = guests.filter((g) => !g.template && g.status === 'running');
  const stoppedGuests = guests.filter((g) => !g.template && g.status !== 'running');

  const storagePcts = storages.map((s) => ({ s, pct: ((s.used ?? 0) / (s.total ?? 1)) * 100 }));
  const kritisStorage = storagePcts.filter((x) => x.pct >= 85);
  const waspadaStorage = storagePcts.filter((x) => x.pct >= 70 && x.pct < 85);

  const alasanPerhatian: string[] = [];
  if (onlineNodes.length < nodes.length)
    alasanPerhatian.push(`${nodes.length - onlineNodes.length} server fisik tidak aktif`);
  if (kritisStorage.length)
    alasanPerhatian.push(`${kritisStorage.length} penyimpanan berstatus KRITIS (>85%)`);
  if (waspadaStorage.length)
    alasanPerhatian.push(`${waspadaStorage.length} penyimpanan mulai penuh (70-85%)`);
  if (failedTasks.length) alasanPerhatian.push(`${failedTasks.length} proses teknis gagal di bulan ini`);
  if (stoppedGuests.length) alasanPerhatian.push(`${stoppedGuests.length} mesin virtual/container dalam keadaan mati`);

  const kondisi =
    alasanPerhatian.length === 0 ? 'SEHAT' : kritisStorage.length ? 'PERLU TINDAK LANJUT SEGERA' : 'CENDERUNG SEHAT, ADA CATATAN';

  const L: string[] = [];
  const garis = '='.repeat(64);
  L.push(garis);
  L.push(`LAPORAN BULANAN INFRASTRUKTUR VIRTUALISASI`);
  L.push(`Cluster : ${cluster.name} (${cluster.host})`);
  L.push(`Periode : ${BULAN[month]} ${year}`);
  L.push(`Dibuat  : ${now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })} ${now.toLocaleTimeString('id-ID', { hour12: false })} WIB oleh ProxCenter`);
  L.push(garis);
  L.push('');
  L.push('A. RINGKASAN UNTUK PIMPINAN');
  L.push(`   Kondisi umum infrastruktur : ${kondisi}`);
  L.push(`   Server fisik aktif         : ${onlineNodes.length} dari ${nodes.length}`);
  L.push(`   Mesin berjalan             : ${runningGuests.length} dari ${guests.length} (sisanya ${stoppedGuests.length} mati)`);
  L.push(`   Gangguan/proses gagal      : ${failedTasks.length} kejadian`);
  if (alasanPerhatian.length) {
    L.push('   Hal yang perlu diperhatikan:');
    for (const a of alasanPerhatian) L.push(`     - ${a}`);
  }
  L.push('');

  L.push('B. KONDISI SERVER FISIK');
  for (const n of nodes) {
    const memPct = fmtPct(n.mem, n.maxmem);
    L.push(`   - ${n.node}: ${n.status === 'online' ? 'AKTIF' : 'TIDAK AKTIF'}, operasional ${hariDariDetik(n.uptime)}, beban kerja ${Math.round((n.cpu ?? 0) * 100)}%, memori terpakai ${memPct} (${fmtGiB(n.mem)} dari ${fmtGiB(n.maxmem)})`);
  }
  L.push('');

  L.push('C. MESIN VIRTUAL & CONTAINER');
  L.push(`   Total ${guests.length} unit: ${runningGuests.length} berjalan, ${stoppedGuests.length} mati, ${guests.filter((g) => g.template).length} template.`);
  const maxList = Math.min(guests.length, 25);
  const sorted = [...guests].sort((a, b) => (a.vmid ?? 0) - (b.vmid ?? 0));
  for (const g of sorted.slice(0, maxList)) {
    const status = g.template ? 'template' : g.status === 'running' ? 'BERJALAN' : String(g.status ?? '?').toUpperCase();
    L.push(`   - [${status}] ${g.name ?? '-'} (ID ${g.vmid}, node ${g.node}) — memori ${fmtPct(g.mem, g.maxmem)} terpakai`);
  }
  if (guests.length > maxList) L.push(`   ... dan ${guests.length - maxList} lainnya (detail lengkap di panel)`);
  L.push('');

  L.push('D. KAPASITAS PENYIMPANAN');
  for (const { s, pct } of storagePcts.sort((a, b) => b.pct - a.pct)) {
    L.push(`   - ${s.storage} (node ${s.node}, ${s.type}): ${fmtPct(s.used, s.total)} terpakai (${fmtGiB(s.used)} dari ${fmtGiB(s.total)}) — ${kategori(pct)}`);
  }
  if (!storages.length) L.push('   Tidak ada data penyimpanan.');
  L.push('');

  L.push('E. CATATAN KEJADIAN PENTING');
  if (!failedTasks.length) {
    L.push('   Tidak ada kegagalan proses teknis yang tercatat pada periode ini.');
  } else {
    L.push(`   Terdapat ${failedTasks.length} kegagalan, antara lain:`);
    for (const t of failedTasks.slice(0, 5)) {
      L.push(`   - ${t.type ?? 'proses'} pada ${new Date((t.starttime ?? 0) * 1000).toLocaleDateString('id-ID')} — status: ${t.status}`);
    }
    if (failedTasks.length > 5) L.push(`   ... dan ${failedTasks.length - 5} lainnya.`);
  }
  L.push('');

  L.push('F. REKOMENDASI TINDAK LANJUT');
  let adaRekom = false;
  for (const { s, pct } of kritisStorage) {
    L.push(`   - Segera tambah/bersihkan kapasitas "${s.storage}" (terpakai ${Math.round(pct)}%).`);
    adaRekom = true;
  }
  for (const { s, pct } of waspadaStorage) {
    L.push(`   - Pantau kapasitas "${s.storage}" (${Math.round(pct)}%) dan rencanakan penambahan ruang.`);
    adaRekom = true;
  }
  if (onlineNodes.length < nodes.length) {
    L.push('   - Periksa server fisik yang tidak aktif bersama tim teknis.');
    adaRekom = true;
  }
  if (failedTasks.length) {
    L.push('   - Tinjau proses yang gagal di atas agar tidak berulang bulan depan.');
    adaRekom = true;
  }
  if (stoppedGuests.length) {
    L.push(`   - Konfirmasi apakah ${stoppedGuests.length} mesin yang mati memang sudah tidak digunakan.`);
    adaRekom = true;
  }
  if (!adaRekom) L.push('   Semua indikator dalam batas normal — tidak ada tindakan khusus bulan ini.');
  L.push('');

  L.push('G. LAMPIRAN: AKTIVITAS ADMINISTRASI PANEL');
  L.push(`   Jumlah aksi tercatat: ${auditMonth.length}`);
  const perAction = new Map<string, number>();
  for (const a of auditMonth) perAction.set(a.action, (perAction.get(a.action) ?? 0) + 1);
  for (const [act, c] of [...perAction.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    L.push(`   - ${act}: ${c} kali`);
  }
  L.push('');
  L.push(garis);
  L.push('Dokumen dihasilkan otomatis oleh ProxCenter — data diambil langsung dari Proxmox VE.');
  L.push(garis);

  const slug = cluster.name.replace(/[^a-zA-Z0-9]+/g, '-');
  return {
    filename: `Laporan-Virtualisasi-${slug}-${year}-${String(month).padStart(2, '0')}.txt`,
    content: L.join('\r\n')
  };
}

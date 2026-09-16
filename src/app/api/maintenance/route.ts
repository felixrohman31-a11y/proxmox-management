import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies, canWrite } from '@/lib/session';
import {
  listMaintenanceSync,
  addMaintenance,
  deleteMaintenance,
  type MaintenanceKind
} from '@/lib/maintenance';
import { appendAudit } from '@/lib/audit';

const KINDS: MaintenanceKind[] = ['cluster', 'node', 'guest'];

export async function GET(req: NextRequest) {
  if (!getSessionFromCookies()) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  }
  const c = req.nextUrl.searchParams.get('c') || undefined;
  return NextResponse.json({ windows: listMaintenanceSync(c) });
}

export async function POST(req: NextRequest) {
  const session = getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  if (!canWrite(session)) {
    return NextResponse.json({ error: 'Akses ditolak. Peran read-only.' }, { status: 403 });
  }
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body tidak valid.' }, { status: 400 });
  }

  const clusterId = String(b.clusterId ?? '').trim();
  const rawKind = String(b.kind ?? 'cluster');
  const kind: MaintenanceKind = KINDS.includes(rawKind as MaintenanceKind) ? (rawKind as MaintenanceKind) : 'cluster';
  const node = typeof b.node === 'string' && b.node.trim() ? b.node.trim() : undefined;
  const vmid = typeof b.vmid === 'number' ? b.vmid : b.vmid != null && b.vmid !== '' ? Number(b.vmid) : undefined;
  const type = b.type === 'qemu' || b.type === 'lxc' ? (b.type as 'qemu' | 'lxc') : undefined;
  const startSec = Math.floor(Number(b.startSec));
  const endSec = Math.floor(Number(b.endSec));
  const reason = typeof b.reason === 'string' ? b.reason.slice(0, 300) : '';

  if (!clusterId) return NextResponse.json({ error: 'Cluster wajib dipilih.' }, { status: 400 });
  if (kind !== 'cluster' && !node) {
    return NextResponse.json({ error: 'Node wajib diisi untuk cakupan node/guest.' }, { status: 400 });
  }
  if (kind === 'guest' && !(typeof vmid === 'number' && isFinite(vmid))) {
    return NextResponse.json({ error: 'VMID wajib diisi untuk cakupan guest.' }, { status: 400 });
  }
  if (!isFinite(startSec) || !isFinite(endSec) || endSec <= startSec) {
    return NextResponse.json({ error: 'Rentang waktu tidak valid — akhir harus setelah awal.' }, { status: 400 });
  }

  const rec = await addMaintenance({
    clusterId,
    kind,
    node,
    vmid: kind === 'guest' ? vmid : undefined,
    type: kind === 'guest' ? type : undefined,
    startSec,
    endSec,
    reason,
    createdBy: session.u
  });

  await appendAudit({
    ts: new Date().toISOString(),
    user: session.u,
    action: 'maintenance.add',
    target: `${clusterId}/${kind}${node ? `/${node}` : ''}${vmid ? `/${vmid}` : ''}`,
    detail: reason || `${new Date(startSec * 1000).toISOString()} → ${new Date(endSec * 1000).toISOString()}`
  });
  return NextResponse.json({ ok: true, window: rec });
}

export async function DELETE(req: NextRequest) {
  const session = getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  if (!canWrite(session)) {
    return NextResponse.json({ error: 'Akses ditolak. Peran read-only.' }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get('id') || '';
  if (!id) return NextResponse.json({ error: 'Parameter id wajib diisi.' }, { status: 400 });
  const ok = await deleteMaintenance(id);
  if (!ok) return NextResponse.json({ error: 'Jendela tidak ditemukan.' }, { status: 404 });
  await appendAudit({
    ts: new Date().toISOString(),
    user: session.u,
    action: 'maintenance.delete',
    target: id
  });
  return NextResponse.json({ ok: true });
}

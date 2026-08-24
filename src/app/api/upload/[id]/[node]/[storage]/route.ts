import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import { getPveClient, PveError } from '@/lib/pve';
import { appendAudit } from '@/lib/audit';

type Ctx = { params: { id: string; node: string; storage: string } };

const MAX_UPLOAD = 512 * 1024 * 1024;

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  }
  const client = getPveClient(ctx.params.id);
  if (!client) {
    return NextResponse.json({ error: 'Cluster tidak ditemukan.' }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Form tidak valid.' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'File tidak ditemukan.' }, { status: 400 });
  }
  if (!/\.(iso|img)$/i.test(file.name)) {
    return NextResponse.json({ error: 'Hanya file .iso atau .img yang diizinkan.' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD) {
    return NextResponse.json(
      {
        error: `Ukuran maksimal unggah lewat panel adalah 512 MB (file Anda ${(file.size / 1024 ** 2).toFixed(0)} MB). Untuk ISO besar gunakan unduh dari URL atau SCP ke host.`
      },
      { status: 413 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await client.uploadFile(ctx.params.node, ctx.params.storage, file.name, 'iso', buffer);
    await appendAudit({
      ts: new Date().toISOString(),
      user: session.u,
      action: 'iso.upload',
      target: `${ctx.params.storage}:iso/${file.name}`,
      detail: `${(buffer.length / 1024 ** 2).toFixed(1)} MB → ${ctx.params.node}`
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = e instanceof PveError ? (e.status >= 400 ? e.status : 502) : 502;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}

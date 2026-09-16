import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import { ShieldIcon, LayersIcon, AlertIcon, CubeIcon } from '@/components/icons';
import { serverT, getServerLocale } from '@/lib/locale-server';
import { ymdToEpochWIB } from '@/lib/report-data';
import { formatRange } from '@/lib/report-strings';
import { fmtDowntime } from '@/lib/sla';
import { fleetSla } from '@/lib/sla-overview';

export const dynamic = 'force-dynamic';

function pct(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(2)}%`;
}

export default async function FleetSlaPage({
  searchParams
}: {
  searchParams?: {
    month?: string | string[];
    start?: string | string[];
    end?: string | string[];
  };
}) {
  const sp = searchParams ?? {};
  const L = serverT();
  const locale = getServerLocale();
  const en = locale === 'en';

  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const isoOf = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;
  const todayY = now.getFullYear();
  const todayM = now.getMonth() + 1;
  const todayD = now.getDate();
  const todayISO = isoOf(todayY, todayM, todayD);

  const first = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);
  const ymd = (v?: string): [number, number, number] | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? '');
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const ps = ymd(first(sp.start));
  const pe = ymd(first(sp.end));
  let sy: number, sm: number, sd: number, ey: number, em: number, ed: number;
  if (ps || pe) {
    [sy, sm, sd] = ps ?? [todayY, todayM, 1];
    [ey, em, ed] = pe ?? [todayY, todayM, todayD];
  } else {
    const parsed = /^(\d{4})-(\d{2})$/.exec(first(sp.month) ?? '');
    const year = parsed ? Math.min(2100, Math.max(2000, Number(parsed[1]))) : todayY;
    const month = parsed ? Math.min(12, Math.max(1, Number(parsed[2]))) : todayM;
    sy = year;
    sm = month;
    sd = 1;
    if (parsed) {
      ey = year;
      em = month;
      ed = new Date(Date.UTC(year, month, 0)).getUTCDate();
    } else {
      ey = todayY;
      em = todayM;
      ed = todayD;
    }
  }
  const startEpoch = ymdToEpochWIB(sy, sm, sd);
  let endEpoch = ymdToEpochWIB(ey, em, ed) + 86400;
  if (endEpoch <= startEpoch) {
    endEpoch = startEpoch + 86400;
    ey = sy;
    em = sm;
    ed = sd;
  }
  const startISO = isoOf(sy, sm, sd);
  const endISO = isoOf(ey, em, ed);
  const rangeLabel = formatRange(
    Math.floor(Date.UTC(sy, sm - 1, sd, 12) / 1000),
    Math.floor(Date.UTC(ey, em - 1, ed, 12) / 1000),
    locale
  );

  const ov = await fleetSla(startEpoch, endEpoch);
  const t = ov.totals;

  return (
    <>
      <PageHeader title={L.fleet.title} subtitle={rangeLabel}>
        <Link href="/dashboard/sla" className="btn-ghost text-xs">
          ← {L.fleet.back}
        </Link>
      </PageHeader>

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500" htmlFor="f-start">{L.sla.from}</label>
          <input id="f-start" type="date" name="start" defaultValue={startISO} max={todayISO} className="input w-auto" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500" htmlFor="f-end">{L.sla.to}</label>
          <input id="f-end" type="date" name="end" defaultValue={endISO} max={todayISO} className="input w-auto" />
        </div>
        <button type="submit" className="btn-primary text-xs">{L.sla.apply}</button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={L.fleet.availability} value={pct(t.avgPct)} sub={L.fleet.weightedAvg} icon={<ShieldIcon />} />
        <StatCard label={L.fleet.clustersLabel} value={`${t.reachable}/${t.clusters}`} sub={L.fleet.reachable} icon={<LayersIcon />} />
        <StatCard label={L.fleet.tracked} value={String(t.tracked)} sub={`${t.compliant} ${L.fleet.compliant} · ${t.noData} ${L.fleet.noData}`} icon={<CubeIcon />} />
        <StatCard
          label={L.fleet.breach}
          value={String(t.breach)}
          sub={t.atRisk > 0 ? `+${t.atRisk} ${L.sla.atRisk}` : L.fleet.allGood}
          icon={<AlertIcon />}
        />
      </div>

      {/* Per-cluster */}
      <div className="card mt-6 p-5">
        <h2 className="text-sm font-semibold text-zinc-200">{L.fleet.perCluster}</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-zinc-500">
              <tr>
                <th className="py-1.5 pr-3 font-medium">{L.fleet.cluster}</th>
                <th className="py-1.5 pr-3 font-medium">{L.fleet.availability}</th>
                <th className="py-1.5 pr-3 font-medium">{L.fleet.compliant}</th>
                <th className="py-1.5 pr-3 font-medium">{L.fleet.breach}</th>
                <th className="py-1.5 pr-3 font-medium">{L.fleet.downtime}</th>
                <th className="py-1.5 pr-3 font-medium">{L.fleet.worst}</th>
              </tr>
            </thead>
            <tbody>
              {ov.clusters.map((c) => (
                <tr key={c.clusterId} className="border-t border-zinc-800/70">
                  <td className="py-2 pr-3">
                    <Link href={`/dashboard/sla?c=${c.clusterId}`} className="font-medium text-orange-400 hover:text-orange-300">
                      {c.name}
                    </Link>
                    <div className="text-xs text-zinc-600">{c.host}</div>
                  </td>
                  {c.reachable ? (
                    <>
                      <td className="py-2 pr-3 font-mono text-zinc-200">{pct(c.avgPct)}</td>
                      <td className="py-2 pr-3 text-emerald-400">
                        {c.compliant}
                        <span className="text-zinc-600">/{c.tracked}</span>
                      </td>
                      <td className={`py-2 pr-3 ${c.breach ? 'text-red-400' : 'text-zinc-600'}`}>{c.breach}</td>
                      <td className="py-2 pr-3 text-zinc-400">
                        {fmtDowntime(c.totalDowntimeMin, en)}
                        {c.maintenanceMin > 0 && (
                          <span className="ml-1 text-[10px] text-zinc-600">· {fmtDowntime(c.maintenanceMin, en)} {L.sla.maintLabel}</span>
                        )}
                      </td>
                      <td className="py-2 text-zinc-500">
                        {c.worst ? (
                          <span>
                            <span className="text-zinc-300">{c.worst.name}</span>{' '}
                            <span className="font-mono text-red-400">{pct(c.worst.pct)}</span>
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </>
                  ) : (
                    <td colSpan={5} className="py-2">
                      <span className="rounded bg-zinc-700/40 px-2 py-0.5 text-[10px] uppercase text-zinc-400">{L.fleet.unreachable}</span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top breaches */}
      <div className="card mt-6 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
          <AlertIcon className="h-4 w-4 text-red-400" /> {L.fleet.topBreaches}
        </h2>
        {ov.topBreaches.length === 0 ? (
          <p className="mt-2 text-sm text-emerald-400/80">{L.fleet.noBreaches}</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-800/70">
            {ov.topBreaches.map((b, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-zinc-200">{b.name}</span>
                  <span className="ml-2 text-xs text-zinc-500">
                    {b.cluster} · {b.node} · <span className="uppercase">{b.kind}</span>
                  </span>
                </div>
                <div className="shrink-0 text-right">
                  <span className="font-mono text-red-400">{pct(b.actualPct)}</span>
                  <span className="ml-2 text-xs text-zinc-600">→ {b.target}%</span>
                  {b.downtimeMin != null && (
                    <div className="text-xs text-zinc-600">{fmtDowntime(b.downtimeMin, en)}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

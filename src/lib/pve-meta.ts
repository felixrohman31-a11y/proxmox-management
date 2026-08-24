import { getPveClient, PveError } from './pve';
import type { CreateMeta } from '@/types';

export async function getCreateMeta(clusterId: string, node: string): Promise<CreateMeta> {
  const client = getPveClient(clusterId);
  if (!client) throw new PveError('Cluster tidak ditemukan.', 404);

  const [nextId, networks, storages] = await Promise.all([
    client.get<string>('/cluster/nextid'),
    client.get<Array<{ iface?: string; type?: string }>>(`/nodes/${node}/network`).catch(() => []),
    client.get<Array<{ storage?: string; content?: string }>>(`/nodes/${node}/storage`).catch(() => [])
  ]);

  const bridges = networks
    .filter((n) => n.type === 'bridge')
    .map((n) => ({ iface: n.iface ?? '' }))
    .filter((b) => b.iface);

  const ctStorages = storages
    .filter((s) => s.content?.split(',').includes('rootdir'))
    .map((s) => s.storage ?? '');
  const vmStorages = storages
    .filter((s) => s.content?.split(',').includes('images'))
    .map((s) => s.storage ?? '');
  const tmplStorages = storages
    .filter((s) => s.content?.split(',').includes('vztmpl'))
    .map((s) => s.storage ?? '');

  const tmplResults = await Promise.all(
    tmplStorages.map((st) =>
      client
        .get<Array<{ volid?: string; size?: number }>>(`/nodes/${node}/storage/${st}/content`, {
          content: 'vztmpl'
        })
        .catch(() => [])
    )
  );

  const lxcTemplates = tmplResults
    .flat()
    .filter((t) => t.volid)
    .map((t) => {
      const volid = t.volid!;
      const m = volid.match(/vztmpl\/([^/]+)$/);
      return { volid, name: m ? m[1] : volid };
    });

  const resources = await client
    .get<Array<{ type?: string; template?: number | boolean; vmid?: number; name?: string }>>(
      '/cluster/resources'
    )
    .catch(() => []);

  const vmTemplates = resources
    .filter((r) => r.type === 'qemu' && r.template && r.vmid)
    .map((r) => ({ vmid: r.vmid!, name: r.name ?? String(r.vmid) }));

  return {
    nextId: String(nextId ?? '100'),
    bridges,
    ctStorages: ctStorages.filter(Boolean),
    vmStorages: vmStorages.filter(Boolean),
    lxcTemplates,
    vmTemplates
  };
}

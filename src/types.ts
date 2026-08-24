export interface PublicCluster {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  insecure: boolean;
  authMethod: 'password' | 'token';
  createdAt: string;
}

export interface NodeRow {
  node: string;
  status: string;
  cpuPercent: number;
  maxCpu: number;
  memUsed: number;
  memMax: number;
  diskUsed: number;
  diskMax: number;
  uptime: number;
}

export interface GuestRow {
  vmid: number;
  name: string;
  type: 'qemu' | 'lxc';
  node: string;
  status: string;
  template: boolean;
  cpuPercent: number;
  memUsed: number;
  memMax: number;
  diskUsed: number;
  diskMax: number;
  uptime: number;
  tags: string[];
}

export interface ClusterTask {
  upid: string;
  node: string;
  user: string;
  type: string;
  vmid?: number;
  starttime?: number;
  endtime?: number;
  status?: string;
}

export interface ActiveTask {
  upid: string;
  node: string;
  vmid: number;
  action: string;
}

export interface CreateBridge {
  iface: string;
}

export interface LxcTemplateOpt {
  volid: string;
  name: string;
}

export interface IsoOpt {
  volid: string;
  name: string;
}

export interface VmTemplateOpt {
  vmid: number;
  name: string;
}

export interface CreateMeta {
  nextId: string;
  bridges: CreateBridge[];
  ctStorages: string[];
  vmStorages: string[];
  lxcTemplates: LxcTemplateOpt[];
  vmTemplates: VmTemplateOpt[];
  isoStorages: string[];
  isos: IsoOpt[];
}

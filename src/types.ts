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

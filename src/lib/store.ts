import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { ensureDataDir } from './secrets';
import { encryptString } from './crypto-store';
import type { PublicCluster } from '@/types';

export interface StoredCluster {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  insecure: boolean;
  authMethod: 'password' | 'token';
  encPassword: string;
  encToken?: string;
  createdAt: string;
}

export interface ClusterUpsert {
  name: string;
  host: string;
  port: number;
  username: string;
  insecure: boolean;
  authMethod: 'password' | 'token';
  password?: string;
  token?: string;
}

function filePath(): string {
  return path.join(ensureDataDir(), 'clusters.json');
}

function readRawList(): StoredCluster[] {
  const fp = filePath();
  if (!fs.existsSync(fp)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(fp, 'utf8'));
    if (!Array.isArray(parsed)) return [];
    return (parsed as StoredCluster[]).map((c) => ({
      ...c,
      authMethod: c.authMethod === 'token' ? 'token' : 'password'
    }));
  } catch {
    return [];
  }
}

async function writeList(list: StoredCluster[]): Promise<void> {
  const fp = filePath();
  const tmp = `${fp}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(list, null, 2), 'utf8');
  await fsp.rename(tmp, fp);
}

function toPublic(s: StoredCluster): PublicCluster {
  return {
    id: s.id,
    name: s.name,
    host: s.host,
    port: s.port,
    username: s.username,
    insecure: s.insecure,
    authMethod: s.authMethod,
    createdAt: s.createdAt
  };
}

export function listClustersSync(): PublicCluster[] {
  return readRawList().map(toPublic);
}

export function getStoredCluster(id: string): StoredCluster | undefined {
  return readRawList().find((c) => c.id === id);
}

export async function createCluster(input: ClusterUpsert): Promise<PublicCluster> {
  const list = readRawList();
  const rec: StoredCluster = {
    id: crypto.randomUUID(),
    name: input.name,
    host: input.host,
    port: input.port,
    username: input.username,
    insecure: input.insecure,
    authMethod: input.authMethod,
    encPassword: encryptString(input.password ?? ''),
    encToken: input.token ? encryptString(input.token) : undefined,
    createdAt: new Date().toISOString()
  };
  list.push(rec);
  await writeList(list);
  return toPublic(rec);
}

export async function updateCluster(id: string, patch: ClusterUpsert): Promise<PublicCluster | null> {
  const list = readRawList();
  const idx = list.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const cur = list[idx];
  const next: StoredCluster = {
    ...cur,
    name: patch.name,
    host: patch.host,
    port: patch.port,
    username: patch.username,
    insecure: patch.insecure,
    authMethod: patch.authMethod
  };
  if (patch.password) next.encPassword = encryptString(patch.password);
  if (patch.token) next.encToken = encryptString(patch.token);
  if (next.authMethod === 'token' && !next.encToken) {
    throw new Error('API Token belum diisi — isi token terlebih dahulu.');
  }
  list[idx] = next;
  await writeList(list);
  return toPublic(next);
}

export async function deleteCluster(id: string): Promise<boolean> {
  const list = readRawList();
  const next = list.filter((c) => c.id !== id);
  if (next.length === list.length) return false;
  await writeList(next);
  return true;
}

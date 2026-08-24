# ProxCenter

Panel manajemen **multi-cluster Proxmox VE** via API — dibangun dengan Next.js 14 + Tailwind CSS.

![stack](https://img.shields.io/badge/Next.js-14-black) ![tailwind](https://img.shields.io/badge/Tailwind-3.4-38bdf8)

## Fitur

- **Multi-cluster dinamis** — tambah/hapus/edit koneksi ke banyak server Proxmox dari UI
- **Dua metode autentikasi**:
  - `User & Password` (tiket PVE, auto-refresh)
  - `API Token` (`PVEAPIToken=user@realm!tokenid=secret`)
- **Overview** — status node, jumlah guest, agregasi CPU/RAM/disk cluster
- **Virtual Machines** — daftar VM & CT lintas node, filter (tipe/status/node/pencarian), aksi Start / Shutdown / Reboot / Force Stop, link konsol noVNC
- **Keamanan**:
  - Login admin panel (session cookie HMAC httpOnly)
  - Kredensial cluster dienkripsi AES-256-GCM sebelum disimpan (`data/clusters.json`)
  - Semua trafik ke Proxmox melewati API route internal — kredensial tidak pernah sampai ke browser
- TLS skip-verify opsional untuk host self-signed

## Arsitektur Singkat

```
Browser ──> Next.js (UI + API Routes) ──HTTPS──> Proxmox VE API (port 8006)
                 │
                 └─ data/clusters.json  (kredensial terenkripsi AES-256-GCM)
                 └─ data/.secret        (key enkripsi, dibuat otomatis)
```

## Menjalankan

```bash
npm install
cp .env.local.example .env.local   # sesuaikan ADMIN_USER/ADMIN_PASSWORD
npm run dev                        # http://localhost:3000
```

Produksi:

```bash
npm run build && npm start         # default port 3000
```

### Variabel Environment

| Var | Default | Keterangan |
|---|---|---|
| `ADMIN_USER` | `admin` | username login panel |
| `ADMIN_PASSWORD` | `admin123` | password login panel (**wajib diganti**) |
| `APP_SECRET` | acak (`data/.secret`) | key signing session (ops., min 16 karakter) |

## Menambah Cluster

1. Login → menu **Clusters** → *Tambah Cluster*
2. Pilih metode auth (password atau API token), isi host/port/user
3. *Tes koneksi* untuk validasi

Rekomendasi user khusus (alih-alih root):

```bash
pveum user add proxcenter@pve --comment "ProxCenter"
pveum aclmod / -users proxcenter@pve -roles Administrator
```

Atau API token:

```bash
pveum user token add proxcenter@pve panel -privsep 0
```

## Struktur

```
src/
├── app/
│   ├── api/            # auth, CRUD clusters, proxy PVE
│   ├── dashboard/      # overview, vms, clusters
│   └── login/
├── components/         # tabel VM, form cluster, nav, dsb.
├── lib/                # pve client, session, store terenkripsi
└── types.ts
```

## Catatan Deployment (contoh: LXC Debian 12)

```bash
apt install -y nodejs npm nginx
cd /opt/proxcenter && npm install && npm run build
# systemd unit + nginx reverse proxy 80/443 -> 3000
```

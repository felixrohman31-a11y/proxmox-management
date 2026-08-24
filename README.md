# ProxCenter

Panel manajemen **multi-cluster Proxmox VE** via API — dibangun dengan Next.js 14 + Tailwind CSS.

![stack](https://img.shields.io/badge/Next.js-14-black) ![tailwind](https://img.shields.io/badge/Tailwind-3.4-38bdf8) ![lang](https://img.shields.io/badge/bahasa-ID-orange)

## Fitur

### Manajemen Cluster
- **Multi-cluster dinamis** — tambah/hapus/edit koneksi dari UI, dua metode auth: `User & Password` atau `API Token` (`PVEAPIToken=user@realm!tokenid=secret`)
- Kredensial disimpan **terenkripsi AES-256-GCM**; semua trafik PVE melewati proxy internal (kredensial tidak pernah menyentuh browser)

### Monitoring & Operasional
- **Overview** — status node, agregasi CPU/RAM/disk, Task Center dengan pemantauan task UPID live
- **Virtual Machines** — daftar VM/CT lintas node + filter, aksi Start/Shutdown/Reboot/Force Stop per guest, **Bulk Action** (pilih banyak → start/shutdown massal), link konsol noVNC
- **Buat Guest** — CT dari template LXC, atau VM via **ISO** (termasuk unduh ISO dari URL secara server-side) / clone template + cloud-init opsional
- **Grafik Monitoring RRD** — riwayat CPU/Memori/Network/Disk IO per node & guest (rentang jam–tahun); guest mati ditampilkan panel pemberitahuan

### Pelaporan
- **Laporan Bulanan** — cakupan **per cluster** atau **gabungan seluruh cluster**
  - Format **HTML mandiri dengan grafik SVG** (siap dicetak/simpan PDF) atau TXT polos
  - Bahasa eksekutif untuk pimpinan: ringkasan kondisi, kapasitas berkategori Aman/Waspada/Kritis, catatan kejadian, rekomendasi tindak lanjut otomatis

### Administrasi
- **Audit Log** — login (sukses/gagal + IP), CRUD cluster, dan setiap aksi mutasi ke PVE tercatat otomatis
- **Backup konfigurasi panel ke FTP** — bundle `clusters.json` + kunci enkripsi + settings, dengan tes koneksi dan opsi harian otomatis (beta)

### Keamanan
- Rate-limit login (lockout 5 menit setelah 5 gagal) + verifikasi constant-time
- Cookie session `HttpOnly` + `Secure` + HMAC-SHA256 (7 hari)
- Contoh nginx menyertakan redirect HTTP→HTTPS & HSTS

## Arsitektur Singkat

```
Browser ──> Next.js (UI + API Routes) ──HTTPS──> Proxmox VE API (port 8006)
                 │
                 ├─ data/clusters.json   (kredensial terenkripsi)
                 ├─ data/.secret         (kunci enkripsi, dibuat otomatis)
                 └─ data/audit.log       (jejak audit JSONL)
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

| Var | Default | Keterangan |
|---|---|---|
| `ADMIN_USER` | `admin` | username login panel |
| `ADMIN_PASSWORD` | `admin123` | password login panel (**wajib diganti**) |
| `APP_SECRET` | acak (`data/.secret`) | key signing session (ops., min 16 karakter) |

## Menambah Cluster

1. Login → menu **Clusters** → *Tambah Cluster*
2. Pilih metode auth, isi host/port/user, lalu *Tes koneksi*

Rekomendasi user khusus (alih-alih root):

```bash
pveum user add proxcenter@pve --comment "ProxCenter"
pveum aclmod / -users proxcenter@pve -roles Administrator
```

Atau API token:

```bash
pveum user token add proxcenter@pve panel -privsep 0
```

## Deployment (contoh: LXC Debian 12)

```bash
apt install -y nodejs npm nginx
cd /opt/proxcenter && npm install && npm run build
# systemd unit + nginx reverse proxy:
#   server 80  -> return 301 https://$host$request_uri
#   server 443 -> ssl + proxy_pass http://127.0.0.1:3000 + HSTS
```

Contoh unit systemd tersedia pada catatan deploy — jalankan dengan `NODE_ENV=production`.

## Struktur

```
src/
├── app/
│   ├── api/            # auth, clusters, proxy PVE (GET/POST/PUT/DELETE),
│   │                   # meta, reports, settings, audit
│   ├── dashboard/      # overview, vms, create, graphs, clusters, settings
│   └── login/
├── components/         # tabel VM, form cluster/guest, charts, panels
├── lib/                # pve client, session, store terenkripsi,
│                       # report generator, ftp-backup, audit
└── types.ts
```

## Roadmap

- [ ] Backup VM/CT (vzdump) dari panel + kelola file dump
- [ ] Notifikasi WhatsApp saat guest down
- [ ] UI tabel audit log di menu Pengaturan
- [ ] Upload ISO dari komputer lokal

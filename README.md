# Proxmox Management

Panel manajemen **multi-cluster Proxmox VE** via API — dibangun dengan Next.js 14 + Tailwind CSS.

![stack](https://img.shields.io/badge/Next.js-14-black) ![tailwind](https://img.shields.io/badge/Tailwind-3.4-38bdf8) ![lang](https://img.shields.io/badge/bahasa-ID-orange)

## Fitur

### Manajemen Cluster
- **Multi-cluster dinamis** — tambah/hapus/edit koneksi dari UI, dua metode auth: `User & Password` atau `API Token` (`PVEAPIToken=user@realm!tokenid=secret`)
- Kredensial disimpan **terenkripsi AES-256-GCM**; semua trafik PVE melewati proxy internal (kredensial tidak pernah menyentuh browser)

### Monitoring & Operasional
- **Overview** — status node, agregasi CPU/RAM/disk, Task Center dengan pemantauan task UPID live
- **Virtual Machines** — daftar VM/CT lintas node + filter, aksi Start/Shutdown/Reboot/Force Stop per guest, **Bulk Action** (pilih banyak → start/shutdown massal), konsol noVNC lewat alur login aman
- **Buat Guest** — CT dari template LXC, atau VM via **ISO** (unggah file ISO lokal ≤512 MB, unduh ISO dari URL secara server-side, atau clone template + cloud-init opsional)
- **Backup VM/CT** — jalankan vzdump (mode snapshot/suspend/stop, kompresi zstd/lzo/gzip), kelola & hapus file dump
- **Grafik Monitoring RRD** — riwayat CPU/Memori/Network/Disk IO per node & guest (rentang jam–tahun); guest mati ditampilkan panel pemberitahuan

### Pelaporan
- **Laporan Bulanan** — cakupan **per cluster** atau **gabungan seluruh cluster**
  - Format **HTML mandiri dengan grafik SVG** (siap dicetak/simpan PDF) atau TXT polos
  - Bahasa eksekutif untuk pimpinan: ringkasan kondisi, kapasitas berkategori Aman/Waspada/Kritis, catatan kejadian, rekomendasi tindak lanjut otomatis

### Administrasi
- **Audit Log** — login (sukses/gagal + IP), CRUD cluster, dan setiap aksi mutasi ke PVE tercatat otomatis; tabel interaktif di menu Pengaturan
- **Notifikasi WhatsApp/Telegram** — peringatan otomatis saat guest terdeteksi mati (monitor tiap 5 menit); mendukung **Fonnte**, **CallMeBot**, dan **Telegram Bot**
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
                 ├─ data/settings.json   (FTP/WA/notifikasi)
                 └─ data/audit.log       (jejak audit JSONL)
```

---

# 🚀 Deploy di Linux

Tested pada **Debian 11/12** (LXC maupun VM). Prinsipnya sama untuk Ubuntu.

## 1. Persiapan Server

```bash
apt update
apt install -y curl git nginx
```

> Untuk container LXC: gunakan template Debian 12, unprivileged, minimal
> 1 core / 1 GB RAM / 8 GB disk.

Instalasi Node.js:

```bash
# Debian 12 → Node 18 langsung dari repo (memadai untuk Next 14)
apt install -y nodejs npm
node -v   # harus >= 18.17
```

Jika butuh Node lebih baru (mis. Debian 11):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

## 2. Ambil Kode & Build

```bash
git clone https://github.com/felixrohman31-a11y/proxmox-management.git /opt/proxmox-management
cd /opt/proxmox-management
npm install --no-audit --no-fund
```

## 3. Konfigurasi Environment

```bash
cat > .env.local <<'EOF'
ADMIN_USER=admin
ADMIN_PASSWORD=GantiDenganPasswordKuat
APP_SECRET=bebas-minimal-16-karakter-acak
EOF
chmod 600 .env.local
```

| Var | Default | Keterangan |
|---|---|---|
| `ADMIN_USER` | `admin` | username login panel |
| `ADMIN_PASSWORD` | `admin123` | password login panel (**wajib diganti**) |
| `APP_SECRET` | acak (`data/.secret`) | key signing session (ops., min 16 karakter) |

## 4. Build

```bash
npm run build
```

Uji cepat: `npm start` lalu buka `http://<ip>:3000/login` — Ctrl+C setelah yakin.

## 5. Service systemd

```bash
cat > /etc/systemd/system/proxmox-management.service <<'EOF'
[Unit]
Description=Proxmox Management - Proxmox multi-cluster panel
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/proxmox-management
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now proxmox-management
systemctl is-active proxmox-management
```

> `ADMIN_PASSWORD` juga bisa didefinisikan sebagai `Environment=...`
> di unit file ini (seperti contoh deployment internal) — pilih salah satu
> sumber: `.env.local` **atau** unit file.

## 6. Nginx Reverse Proxy + HTTPS

Sertifikat self-signed (ganti dengan Let's Encrypt bila domain tersedia):

```bash
mkdir -p /etc/nginx/ssl
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/proxmox-management.key \
  -out  /etc/nginx/ssl/proxmox-management.crt \
  -subj "/CN=$(hostname -I | awk '{print $1}')"
```

Config site:

```bash
cat > /etc/nginx/sites-available/proxmox-management <<'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name _;

    ssl_certificate     /etc/nginx/ssl/proxmox-management.crt;
    ssl_certificate_key /etc/nginx/ssl/proxmox-management.key;

    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/proxmox-management /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx
```

Panel kini dapat diakses di `http(s)://<ip-server>`.

---

## 🔁 Prosedur Update

```bash
cd /opt/proxmox-management
git pull
npm install --no-audit --no-fund
npm run build
systemctl restart proxmox-management
```

Data (`data/`) tidak terpengaruh oleh update.

## 💾 Backup & Restore Konfigurasi

Backup bisa dibuat otomatis dari menu **Pengaturan → Backup FTP**
(menghasilkan satu file JSON berisi `clusters.json`, `.secret`, `settings.json`).

Restore di mesin baru:

```bash
systemctl stop proxmox-management
# ekstrak field "files" dari bundle backup ke /opt/proxmox-management/data/
systemctl start proxmox-management
```

> `.secret` wajib dipasangkan dengan `clusters.json` yang sama — jangan
> dicampur antar instalasi. Lindungi file backup karena berisi kunci.

---

## ➕ Menambah Cluster Proxmox

1. Login panel → menu **Clusters** → *Tambah Cluster*
2. Pilih metode auth (password atau API token), isi host/port/user, tes koneksi

Rekomendasi user khusus (alih-alih root):

```bash
pveum user add proxmox-management@pve --comment "Proxmox Management"
pveum aclmod / -users proxmox-management@pve -roles Administrator
```

Atau API token:

```bash
pveum user token add proxmox-management@pve panel -privsep 0
```

---

## 🗂️ Struktur Proyek

```
src/
├── app/
│   ├── api/            # auth, clusters, proxy PVE (GET/POST/PUT/DELETE),
│   │                   # meta, reports, settings, upload, audit
│   ├── dashboard/      # overview, vms, create, backup, graphs,
│   │                   # clusters, settings, console
│   └── login/
├── components/         # tabel VM, form cluster/guest, charts, panels
├── lib/                # pve client, session, store terenkripsi,
│                       # report generator, ftp-backup, monitor, audit
└── types.ts
```

## Roadmap

- [x] Backup VM/CT (vzdump) dari panel + kelola file dump
- [x] Notifikasi WhatsApp/Telegram saat guest down
- [x] UI tabel audit log di menu Pengaturan
- [x] Upload ISO dari komputer lokal (≤512 MB)
- [ ] Multi-user panel + RBAC
- [ ] Restore VM/CT langsung dari file dump
- [ ] Grafik monitoring per guest dengan jendela kustom

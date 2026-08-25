# Proxmox Management

[English](#english) | [Bahasa Indonesia](#bahasa-indonesia)

![stack](https://img.shields.io/badge/Next.js-14-black) ![tailwind](https://img.shields.io/badge/Tailwind-3.4-38bdf8) ![i18n](https://img.shields.io/badge/i18n-ID_&_EN-blue)

---

## English

A **multi-cluster Proxmox VE management panel** built with Next.js 14 + Tailwind CSS.

### Features

#### Cluster Management
- **Dynamic multi-cluster** — add/remove/edit connections from the UI
- Two auth methods: `User & Password` or `API Token`
- Credentials stored encrypted with **AES-256-GCM**

#### Monitoring & Operations
- **Overview** — node status, resource aggregation, Task Center with live UPID monitoring
- **Virtual Machines** — cross-node VM/CT list with filters, Start/Shutdown/Reboot/Force Stop per guest, **Bulk Actions**, noVNC console via safe login flow
- **Create Guest** — CT from LXC template, VM via ISO (upload ≤512 MB, download from URL server-side), or clone template + cloud-init
- **VM/CT Backup** — vzdump (snapshot/suspend/stop mode, zstd/lzo/gzip), manage dump files
- **Monitoring Graphs** — RRD history: CPU/Memory/Network/Disk IO per node & guest (hour–year)

#### Reporting
- **Monthly Report** — per cluster or consolidated across all clusters
  - Self-contained HTML with inline SVG charts (print-ready PDF) and plain TXT
  - Executive summary language + automatic follow-up recommendations

#### Administration
- **Audit Log** — logins, cluster CRUD, all PVE mutations recorded automatically
- **Notifications** — WhatsApp/Telegram alerts when a guest goes down (Fonnte / CallMeBot / Telegram Bot)
- **FTP Config Backup** — panel configuration bundle with connection test & auto-daily option

### Security
- Login rate-limiting (lockout after 5 failures) + constant-time comparison
- Session cookie `HttpOnly` + `Secure` + HMAC-SHA256 (7 days)
- Nginx HTTP→HTTPS redirect + HSTS

### Architecture

```
Browser ──> Next.js (UI + API Routes) ──HTTPS──> Proxmox VE API (port 8006)
                 │
                 ├─ data/clusters.json   (encrypted credentials)
                 ├─ data/.secret         (encryption key, auto-generated)
                 └─ data/audit.log       (JSONL audit trail)
```

---

## 🚀 Deploy on Linux

Tested on **Debian 11/12** (LXC or VM).

### 1. Dependencies

```bash
apt update && apt install -y curl git nginx
apt install -y nodejs npm   # Debian 12 → Node 18 ✓
node -v                     # >= 18.17
```

### 2. Clone & Build

```bash
git clone https://github.com/felixrohman31-a11y/proxmox-management.git /opt/proxmox-management
cd /opt/proxmox-management
npm install --no-audit --no-fund
```

### 3. Environment

```bash
cat > .env.local <<'EOF'
ADMIN_USER=admin
ADMIN_PASSWORD=ChangeThisStrongPassword
APP_SECRET=random-min-16-chars
EOF
chmod 600 .env.local
```

| Variable | Default | Description |
|---|---|---|
| `ADMIN_USER` | `admin` | Panel login username |
| `ADMIN_PASSWORD` | `admin123` | Panel login password (**must change**) |
| `APP_SECRET` | random (`data/.secret`) | Session signing key |

### 4. Build

```bash
npm run build
```

### 5. Systemd Service

```bash
cat > /etc/systemd/system/proxmox-management.service <<'EOF'
[Unit]
Description=Proxmox Management - multi-cluster panel
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
```

### 6. Nginx Reverse Proxy + HTTPS

```bash
mkdir -p /etc/nginx/ssl
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/proxcenter.key \
  -out  /etc/nginx/ssl/proxcenter.crt \
  -subj "/CN=$(hostname -I | awk '{print $1}')"

cat > /etc/nginx/sites-available/proxmox-management <<'EOF'
server {
    listen 80 default_server;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl default_server;
    ssl_certificate /etc/nginx/ssl/proxcenter.crt;
    ssl_certificate_key /etc/nginx/ssl/proxcenter.key;
    client_max_body_size 0;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/proxmox-management /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx
```

Panel accessible at `https://<server-ip>`.

### Updating

```bash
cd /opt/proxmox-management && git pull && npm install && npm run build && systemctl restart proxmox-management
```

### Adding a Proxmox Cluster

Recommended dedicated user:

```bash
pveum user add proxmox-management@pve
pveum aclmod / -users proxmox-management@pve -roles Administrator
```

Or API token:

```bash
pveum user token add proxmox-management@pve panel -privsep 0
```

### Project Structure

```
src/
├── app/api/         # auth, clusters, PVE proxy, meta, reports, settings, upload, audit
├── app/dashboard/   # overview, vms, create, backup, graphs, clusters, settings, console
├── components/      # tables, forms, charts, panels
├── lib/             # pve client, i18n, session, encrypted store, reports
└── types.ts
```

## Roadmap

- [ ] Multi-user panel + RBAC
- [ ] Restore VM/CT directly from dump files
- [ ] Per-guest custom monitoring windows

---

## Bahasa Indonesia

Panel manajemen **multi-cluster Proxmox VE** via API — dibangun dengan Next.js 14 + Tailwind CSS.

### Fitur

**Manajemen Cluster**
- Multi-cluster dinamis dengan auth User & Password atau API Token
- Kredensial terenkripsi AES-256-GCM

**Monitoring & Operasional**
- Overview + Task Center pemantauan UPID live
- Daftar VM/CT dengan filter & Bulk Action start/shutdown massal
- Buat Guest: CT dari template, VM via ISO (unggah lokal / unduh URL / clone)
- Backup VM/CT via vzdump + kelola file dump
- Grafik Monitoring RRD per node & guest

**Pelaporan**
- Laporan Bulanan per cluster atau gabungan seluruh cluster
- Format HTML dengan grafik SVG (cetak ke PDF) atau TXT
- Bahasa eksekutif untuk pimpinan + rekomendasi otomatis

**Administrasi**
- Audit Log otomatis
- Notifikasi WhatsApp/Telegram saat guest mati
- Backup konfigurasi panel ke FTP

**Keamanan**: rate-limit login, cookie Secure/HMAC-SHA256, enkripsi AES-256-GCM, HSTS

### Deploy

Panduan lengkap ada di bagian [Deploy on Linux](#-deploy-on-linux) di atas.

### Menambah Cluster

```bash
pveum user add proxmox-management@pve
pveum aclmod / -users proxmox-management@pve -roles Administrator
```

Atau API token:

```bash
pveum user token add proxmox-management@pve panel -privsep 0
```

---

## 💝 Support / Dukungan

If you find this project useful, donations are appreciated!
Jika Proxmox Management bermanfaat, dukungan donasi sangat membantu.

**BNB Chain (BEP-20):**

```
0x4649b364523D4DdC329583E218f20d52b2997367
```

Thank you / Terima kasih! 🙏

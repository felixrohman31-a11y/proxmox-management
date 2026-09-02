# Proxmox Management

[English](#english) | [Bahasa Indonesia](#bahasa-indonesia)

![stack](https://img.shields.io/badge/Next.js-14-black) ![tailwind](https://img.shields.io/badge/Tailwind-3.4-38bdf8) ![i18n](https://img.shields.io/badge/i18n-ID_&_EN-blue) ![license](https://img.shields.io/badge/license-MIT-green)

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
- **SLA Monitoring** — per-node & per-guest availability targets with compliance summary and breach detection (see [SLA Monitoring](#sla-monitoring))

#### Reporting
- **Monthly Report** — per cluster or consolidated across all clusters
  - Self-contained HTML with inline SVG charts (print-ready PDF) and plain TXT
  - Executive summary language + automatic follow-up recommendations

#### Administration
- **User Management & RBAC** — 3 roles: **Super Admin** (manage all users/roles), **Administrator** (manage auditors only), **Auditor** (read-only, own password only); scrypt-hashed passwords, last-super-admin lockout guard
- **Audit Log** — logins, user/role changes, cluster CRUD, all PVE mutations recorded automatically
- **Notifications** — WhatsApp/Telegram alerts when a guest goes down (Fonnte / CallMeBot / Telegram Bot)
- **FTP Config Backup** — panel configuration bundle with connection test & auto-daily option

### Security
- Login rate-limiting (lockout after 5 failures) + constant-time comparison
- Passwords hashed with **scrypt** (N=16384); per-role access enforced server-side (auditor read-only)
- Session cookie `HttpOnly` + `Secure` + HMAC-SHA256 (7 days); sessions invalidated on password change/reset and account disable
- Super-admin self-lockout protection: cannot demote/disable/delete itself, last super-admin is guarded
- Nginx HTTP→HTTPS redirect + HSTS

### Architecture

```
Browser ──> Next.js (UI + API Routes) ──HTTPS──> Proxmox VE API (port 8006)
                 │
                 ├─ data/clusters.json   (encrypted credentials, AES-256-GCM)
                 ├─ data/users.json      (panel users, scrypt-hashed, 3-tier RBAC)
                 ├─ data/.secret         (encryption key, auto-generated)
                 └─ data/audit.log       (JSONL audit trail)
```

### SLA Monitoring

Availability is tracked per node and per guest against a configurable target (default **99.9%**, customisable 50–100% per entity in `data/sla.json`).

- **Data source** — Proxmox RRD (`rrddata`, `timeframe=month`, `cf=AVERAGE`), one series per node and per VM/CT.
- **"Up" definition** — an RRD sample counts as *up* when it carries a numeric `cpu` or `memused` metric. A sample with no metric means the entity was not alive at that instant and counts toward downtime.
- **Sampling interval** — the median gap between consecutive RRD rows (≈5 minutes, 300 s fallback).
- **Window** — from `max(month start, first active sample)` to `now` for entities currently online/running, or to `last active sample + one interval` for stopped entities (an outage after that point is treated as an intentional shutdown, not a breach).
- **Availability** — the window is swept one interval at a time: `availability = up slots / total slots × 100` (3 decimals), where a slot is *up* if an active sample falls within ±half-interval. Downtime = `(total − up) × interval`.
- **Result** — each entity is `ok` (actual ≥ target), `breach` (actual < target), or `no-data` (no RRD samples). The summary rolls up compliant/breach/no-data counts, average availability, and total downtime.

> **Note:** RRD `timeframe=month` retains only ~30 days — months older than that report as `no-data`.

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

The `ADMIN_USER` account is bootstrapped as **Super Admin** on first run; additional users/roles are managed from the panel itself (Users page).

### 4. Build

```bash
npm run build
```

### 5. Systemd Service

```bash
cat > /etc/systemd/system/proxmox-management.service <<'EOF'
[Unit]
Description=Proxmox Management - multi-cluster panel
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/proxmox-management
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node node_modules/next/dist/bin/next start
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
    add_header Strict-Transport-Security "max-age=31536000" always;
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

- [x] Multi-user panel + RBAC (3-tier: Super Admin / Administrator / Auditor)
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
- **SLA Monitoring** — target ketersediaan per node & guest, deteksi breach, ringkasan kepatuhan

**Pelaporan**
- Laporan Bulanan per cluster atau gabungan seluruh cluster
- Format HTML dengan grafik SVG (cetak ke PDF) atau TXT
- Bahasa eksekutif untuk pimpinan + rekomendasi otomatis

**Administrasi**
- **Manajemen User & RBAC** — 3 peran: **Super Admin** (kelola semua user/peran), **Administrator** (kelola auditor saja), **Auditor** (read-only, ganti password sendiri); password di-hash scrypt, guard super-admin-terakhir
- Audit Log otomatis (login, perubahan user/peran, mutasi cluster/VM)
- Notifikasi WhatsApp/Telegram saat guest mati
- Backup konfigurasi panel ke FTP

**Keamanan**: rate-limit login, password scrypt, cookie Secure/HMAC-SHA256, enkripsi AES-256-GCM, HSTS, proteksi lockout super admin

**Penghitungan SLA**: ketersediaan dihitung dari rrddata Proxmox (timeframe=month, cf=AVERAGE). Sampel ber-metrik `cpu`/`memused` = hidup, tanpa metrik = downtime. Interval = median selisih antar baris RRD (±5 menit). Ketersediaan = slot hidup / total slot × 100 (target default 99,9%, dapat diatur per entitas 50–100%). Status: `ok` / `breach` / `no-data`.

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


---

## 📄 License & Author

This project is licensed under the **MIT License** — free to use, modify, and distribute.

**Author:** [felixrohman31-a11y](https://github.com/felixrohman31-a11y)

---

## 💝 Support / Dukungan

If you find this project useful, donations are appreciated!
Jika Proxmox Management bermanfaat, dukungan donasi sangat membantu.

**BNB Chain (BEP-20):**

```
0x4649b364523D4DdC329583E218f20d52b2997367
```

Thank you / Terima kasih! 🙏

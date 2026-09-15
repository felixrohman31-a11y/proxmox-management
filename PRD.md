# PRD — Proxmox Management

Product Requirements Document

| | |
|---|---|
| **Produk** | Proxmox Management — Panel manajemen multi-cluster Proxmox VE |
| **Versi dokumen** | 1.0 |
| **Versi produk** | v1.4.0 |
| **Status** | Aktif / Dipelihara |
| **Author** | felixrohman31-a11y |
| **Repo** | https://github.com/felixrohman31-a11y/proxmox-management |
| **Lisensi** | MIT |

---

## 1. Ringkasan Eksekutif

Proxmox Management adalah **panel web terpusat untuk mengelola banyak server Proxmox VE** dari satu antarmuka. Admin tidak perlu membuka GUI tiap Proxmox satu per satu: seluruh node/guest, status, backup, grafik, SLA, laporan, dan jejak audit dapat dilihat serta dikendalikan dari satu dashboard Next.js.

Produk menargetkan lingkungan dengan **banyak server Proxmox yang tersebar** (mis. antar-site/instansi) dengan versi PVE beragam — termasuk versi lama seperti PVE 4.x/5.x — sehingga panel harus toleran terhadap perbedaan bentuk API antar-versi.

**Nilai utama:**
1. **Sentralisasi operasi** — ringkasan multi-cluster, kontrol VM/CT, konsol, backup dari satu UI.
2. **Keamanan berlapis** — kredensial cluster terenkripsi (AES-256-GCM), sesi HMAC-SHA256, RBAC 3 peran, audit log, proteksi lockout super admin.
3. **Akuntabilitas** — laporan bulanan eksekutif + monitoring SLA per node/guest + notifikasi WhatsApp/Telegram.
4. **Bilingual** — Bahasa Indonesia dan English paritas penuh.

---

## 2. Latar Belakang & Masalah

- Organisasi mengoperasikan **lebih dari satu server Proxmox VE** (contoh nyata: `PVE1`, `pve2`, `pve3` pada segmen jaringan berbeda).
- GUI Proxmox asli hanya melihat **satu node/cluster**; merangkum kesehatan semua server = buka banyak tab, tidak praktis.
- Tanpa audit & RBAC terpusat, risiko operasional dan keamanan sulit dikendalikan.
- Banyak server masih berjalan di **PVE versi lama (4.4, 5.x) yang EOL**, dengan bentuk API berbeda dari PVE modern → alat bantu harus menangani keduanya.

## 3. Tujuan Produk

| Tujuan | Deskripsi |
|---|---|
| G1 | Satu titik kelola untuk node & guest di seluruh cluster Proxmox (status, aksi, konsol, backup). |
| G2 | Ringkasan kesehatan & pemantauan historis (RRD) per node dan guest. |
| G3 | SLA + laporan bulanan eksekutif untuk akuntabilitas layanan. |
| G4 | Keamanan: kredensial terenkripsi, RBAC, rate-limit, audit, sesi aman. |
| G5 | Dukungan spektrum PVE 4.x – 8.x tanpa reboot/downtime server target. |
| G6 | UI premium (dark), responsif, dan dwibahasa (ID/EN). |

## 4. Bukan Tujuan (Non-Goals)

- **Bukan pengganti GUI Proxmox** untuk pekerjaan tingkat dalam (migrasi VM antar-node, konfigurasi storage/jaringan detil, manajemen cluster/corosync).
- **Tidak melakukan upgrade/perbaikan sisi server PVE** (mis. memperbaiki daemon PVE, upgrade mayor) — itu di luar lingkup panel.
- **Tidak menyediakan HA/klaster lintas panel** (panel membaca node standalone maupun cluster sebagai entitas koneksi terpisah).

## 5. Pengguna & Persona

### 5.1 Peran (RBAC)

| Peran | Hak | Batasan |
|---|---|---|
| **Super Admin** | Kelola semua user & semua peran (superadmin/admin/auditor), reset password siapa pun, seluruh operasi PVE. | Tidak bisa mengubah peran/status akun sendiri, tidak bisa menghapus diri; dilindungi guard "super admin terakhir". |
| **Administrator** | Kelola user **auditor** (reset password, ubah role auditor→admin, nonaktif/hapus), seluruh operasi PVE. | Tidak bisa mengelola super admin / admin lain. |
| **Auditor** | Read-only: dashboard, daftar guest, grafik, SLA, laporan. Hanya bisa ganti password sendiri. | Tidak ada aksi tulis (create/backup/start/stop/cluster/SLA/settings). |

### 5.2 Persona

- **Admin infrastruktur (Super Admin)** — mengelola seluruh server & akun; ingin satu dasbor + kontrol penuh.
- **Admin site (Administrator)** — bertanggung jawab atas satu site; cukup kelola auditor & operasional.
- **Auditor / pimpinan teknis** — memantau kesehatan & SLA, menerima laporan; tanpa hak ubah.
- **Staf umum** — membuka laporan bulanan (HTML/PDF).

## 6. Use Case Utama

- UC-1 Menambah/menguji koneksi cluster Proxmox (password atau API token).
- UC-2 Melihat ringkasan multi-cluster: node online/offline, pemakaian CPU/RAM/disk agregat.
- UC-3 Mengendalikan guest: start / shutdown / reboot / force-stop, aksi massal, konsol noVNC.
- UC-4 Membuat guest: CT dari template, VM dari ISO (unggah/URL), clone template + cloud-init.
- UC-5 Backup guest (vzdump) & mengelola file dump.
- UC-6 Melihat grafik RRD & status SLA bulan berjalan per node/guest.
- UC-7 Menghasilkan laporan bulanan (HTML+SVG / TXT) per cluster atau gabungan.
- UC-8 Menerima notifikasi WhatsApp/Telegram saat guest down.
- UC-9 Mengaudit aktivitas (login, CRUD cluster, aksi PVE, perubahan user/role).
- UC-10 Mengelola user dengan RBAC; ganti password sendiri dengan opsi memutus sesi lain.
- UC-11 Backup konfigurasi panel ke FTP (manual/jadwal harian).

## 7. Kebutuhan Fungsional

Prioritas: **P0** wajib inti · **P1** penting · **P2** penyempurna.

### A. Manajemen Cluster
| ID | Kebutuhan | Pr. |
|---|---|---|
| A-1 | CRUD koneksi cluster dari UI (nama, host, port, user). | P0 |
| A-2 | Dua metode auth: **User & Password** (`root@pam`) atau **API Token**. | P0 |
| A-3 | Kredensial disimpan terenkripsi **AES-256-GCM**; kunci di `data/.secret` (auto-generate). | P0 |
| A-4 | Opsi **insecure/skip-verify** untuk TLS self-signed. | P0 |
| A-5 | **Test koneksi** sebelum menyimpan (timeout terkendali + pesan jelas). | P0 |
| A-6 | Audit setiap perubahan cluster. | P1 |

### B. Monitoring & Operasi Guest
| ID | Kebutuhan | Pr. |
|---|---|---|
| B-1 | Overview: status node, agregasi CPU/RAM/disk, Task Center (UPID live). | P0 |
| B-2 | Daftar VM/CT lintas-node + filter, kolom status/cpu/mem/disk/uptime. | P0 |
| B-3 | Aksi per guest: start, shutdown, reboot, force-stop. | P0 |
| B-4 | **Bulk actions** massal. | P1 |
| B-5 | Konsol **noVNC** via alur login aman (vncshell/vncproxy). | P1 |
| B-6 | Akurasi status pada PVE lama (≤4.x/5.x) lewat fallback endpoint status (lihat NF-3). | P0 |

### C. Create Guest
| ID | Kebutuhan | Pr. |
|---|---|---|
| C-1 | Buat **CT** dari template LXC. | P0 |
| C-2 | Buat **VM** dari ISO: unggah lokal (≤512 MB) atau unduh dari URL di sisi server. | P0 |
| C-3 | Buat VM/CT dari **clone template + cloud-init** (user/password/IP). | P1 |
| C-4 | Dukungan import VMware (opsional). | P2 |

### D. Backup & Restore
| ID | Kebutuhan | Pr. |
|---|---|---|
| D-1 | Backup guest via **vzdump** (mode snapshot/suspend/stop; kompresi zstd/lzo/gzip). | P0 |
| D-2 | Kelola file dump (daftar/hapus). | P1 |
| D-3 | **Restore VM/CT dari dump** (roadmap). | P2 |

### E. Grafik & SLA
| ID | Kebutuhan | Pr. |
|---|---|---|
| E-1 | Grafik RRD per node & guest: CPU/Memory/Network/Disk IO (rentang jam–tahun). | P0 |
| E-2 | Monitoring **SLA**: target ketersediaan default 99,9%, bisa diatur per entitas 50–100%. | P1 |
| E-3 | Perhitungan SLA dari rrddata PVE; status `ok`/`breach`/`no-data` + ringkasan. | P1 |

### F. Laporan Bulanan
| ID | Kebutuhan | Pr. |
|---|---|---|
| F-1 | Laporan per cluster atau gabungan seluruh cluster. | P1 |
| F-2 | Format HTML self-contained + grafik SVG inline (siap cetak PDF) dan TXT. | P1 |
| F-3 | Ringkasan eksekutif dwibahasa + rekomendasi tindak lanjut otomatis. | P2 |

### G. Notifikasi
| ID | Kebutuhan | Pr. |
|---|---|---|
| G-1 | Peringatan saat guest down via **WhatsApp (Fonnte/CallMeBot)** dan **Telegram**. | P1 |
| G-2 | Konfigurasi provider + nomor/chatId dari UI; uji kirim. | P1 |

### H. Audit Log
| ID | Kebutuhan | Pr. |
|---|---|---|
| H-1 | Catat login, CRUD cluster, seluruh mutasi PVE, perubahan user/role. | P0 |
| H-2 | Simpan sebagai JSONL (`data/audit.log`) + tampilan panel. | P1 |

### I. User Management, RBAC & Akun
| ID | Kebutuhan | Pr. |
|---|---|---|
| I-1 | CRUD user; role `superadmin`/`admin`/`auditor`; enable/disable. | P0 |
| I-2 | Enforce RBAC **di sisi server** (auditor read-only). | P0 |
| I-3 | Guard **super-admin-terakhir**; super admin tidak bisa self-demote/disable/delete. | P0 |
| I-4 | Reset password oleh admin (menaikkan `pwdVersion` → sesi lama mati). | P0 |
| I-5 | **Akun Saya**: ganti password sendiri; opsi **putuskan sesi di perangkat lain** (default aktif) sementara perangkat ini tetap login. | P0 |
| I-6 | Login rate-limit (kunci setelah 5 gagal) + perbandingan konstanta-waktu. | P0 |
| I-7 | Migrasi peran lama `viewer` → `auditor` otomatis. | P1 |

### J. Backup Konfigurasi Panel (FTP)
| ID | Kebutuhan | Pr. |
|---|---|---|
| J-1 | Bundle konfigurasi panel (cluster terenkripsi + kunci) ke server FTP; uji koneksi. | P1 |
| J-2 | Opsi backup harian otomatis. | P2 |

### K. Lokalisasi & UI
| ID | Kebutuhan | Pr. |
|---|---|---|
| K-1 | Dua bahasa (ID/EN) dengan paritas kunci penuh; mudah ditambah. | P0 |
| K-2 | UI dark-premium, responsif, fokus terlihat (a11y), mikrointeraksi. | P1 |

## 8. Kebutuhan Non-Fungsional

| Kode | Aspek | Requirement |
|---|---|---|
| NF-1 | **Keamanan kredensial** | Enkripsi AES-256-GCM; kunci `data/.secret` (0600). |
| NF-2 | **Sesi** | Cookie `HttpOnly`+`Secure`+`SameSite`, ditandatangani HMAC-SHA256; masa aktif 7 hari; invalidasi via `pwdVersion` saat ganti/reset password atau nonaktif akun. |
| NF-3 | **Kompatibilitas API PVE** | PVE modern (6/7/8) mengirim `status`+metrik di `/cluster/resources`; PVE lama (4.x–5.x) tidak → panel wajib fallback ke `/nodes/{node}/status` & `/{type}/{vmid}/status/current`. |
| NF-4 | **Performansi** | Cache ticket PVE 90 menit; cache SLA 2 menit; agregasi ringkas untuk node besar. |
| NF-5 | **Keandalan** | Timeout koneksi terkendali + pesan error yang jelas (tidak hang). |
| NF-6 | **Deployment** | Build Next.js produksi; systemd + Nginx (HTTPS→redirect + HSTS); tanpa downtime VM saat perawatan panel. |
| NF-7 | **Kualitas** | `typecheck` lulus, `vitest` (unit, ≥29 test), `next build` sukses sebagai gerbang. |
| NF-8 | **Bahasa** | Paritas penuh kamus ID↔EN; default mengikuti preferensi/locale server. |
| NF-9 | **Auditabilitas** | Semua aksi tulis tercatat (siapa, kapan, apa, target, detail). |

## 9. Arsitektur Teknis (Ringkas)

```
Browser ──> Next.js 14 (App Router: UI + API routes) ──HTTPS──> Proxmox VE API (:8006)
                 │
                 ├─ data/clusters.json   (kredensial terenkripsi AES-256-GCM)
                 ├─ data/users.json      (user + RBAC; password scrypt)
                 ├─ data/sla.json        (target SLA)
                 ├─ data/.secret         (kunci enkripsi, auto-generated)
                 └─ data/audit.log       (jejak JSONL)
```

- **Stack:** Next.js 14 (server components `force-dynamic` + komponen client `'use client'`), TypeScript, Tailwind 3.4, Recharts, Node ≥18.17.
- **Klien PVE** (`PveClient`): auth `ticket` (login + cache 90 menit, retry on 401) atau `API token`; dukungan TLS insecure.
- **RBAC & sesi:** payload sesi `{id,u,role,pwdVersion,exp}` di-HMAC; peran selalu dibaca segar dari store; `canOperate`/`canWrite`/`canManage` dievaluasi server-side.
- **i18n:** kamus terpusat; bahasa UI id/en.

## 10. Batasan & Asumsi

1. Server Proxmox diakses via **HTTPS :8006** (bisa self-signed → opsi insecure).
2. Akun koneksi: `root@pam` (atau user PVE berhak) / API token dengan hak memadai.
3. SLA berbasis rrddata `timeframe=month` → hanya ~30 hari terakhir; bulan lebih tua berstatus `no-data`.
4. Guest tanpa QEMU guest agent → pemakaian disk qemu bisa tampil 0 (keterbatasan PVE).
5. Panel tidak menambal kondisi sisi server PVE (daemon wedge, versi EOL).

## 11. Kriteria Sukses & Metrik

| Metrik | Target |
|---|---|
| Waktu menambah cluster (test + simpan) | < 1 menit, error jelas |
| Muat overview cluster ≤ ~30 guest | < 5 detik |
| Akurasi status node/guest (termasuk PVE lama) | 100% cocok dengan kondisi aktual |
| Keberhasilan aksi (start/stop/backup) | Terverifikasi + tercatat audit |
| Tidak ada lockout admin (guard super-admin) | Self-demote/disable/delete ditolak |
| Kualitas rilis | typecheck ✓ · test ✓ · build ✓ sebelum release |

## 12. Roadmap / Riwayat Rilis

| Versi | Isi | Status |
|---|---|---|
| v1.0–v1.2 | Inti: multi-cluster, overview, VM/CT, create, backup, grafik, laporan, audit, notifikasi, FTP config, hardening (PBKDF2/scrypt, rate-limit), SLA, i18n. | Dirilis |
| v1.3 | Multi-user + RBAC dasar + guard admin terakhir. | Dirilis |
| v1.4 | **RBAC 3-tier** (superadmin/admin/auditor), kontrol sesi saat ganti password, proteksi super-admin self-lockout, kompatibilitas PVE lama (≤4.x/5.x). | Dirilis |
| v1.5+ (usulan) | Restore VM/CT dari dump; jendela monitoring custom per guest; peningkatan notifikasi; pagination cluster besar. | Rencana |

## 13. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Server PVE lama (4.4/5.1) EOL tanpa patch | Keamanan/kompatibilitas | Fitur fallback API; edukasi upgrade bertahap 4→5→6→7→8 dengan backup `vzdump` |
| Cluster sangat besar / banyak guest | Lambat | Agregasi server-side, pagination, cache |
| Kehilangan `data/.secret` | Kredensial tak bisa didekripsi | Backup folder `data/`; fitur FTP config backup |
| Downtime saat perawatan panel | VM terganggu | Arsitektur memisahkan panel dari hypervisor; restart daemon manajemen PVE saja |
| Akun tidak sah / salah peran | Aksi tak diizinkan | RBAC server-side + audit + rate-limit login |

## 14. Glosarium

- **Guest** — VM (QEMU) atau container (LXC/CT) di Proxmox.
- **Node** — host fisik/virtual yang menjalankan Proxmox VE.
- **Cluster (panel)** — satu entitas koneksi Proxmox (bisa node standalone).
- **vzdump** — alat backup bawaan Proxmox.
- **UPID** — identitas unik task Proxmox (untuk Task Center).
- **rrddata** — data deret waktu Proxmox (RRD) untuk grafik & SLA.
- **RBAC** — Role-Based Access Control.
- **pwdVersion** — nomor versi kata sandi akun; naik ⇒ sesi lama tidak valid.

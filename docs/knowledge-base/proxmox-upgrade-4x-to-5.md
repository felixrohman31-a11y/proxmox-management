# Knowledge Base — Proxmox VE Upgrade 4.x → 5.0

> **Sumber resmi:** https://pve.proxmox.com/wiki/Upgrade_from_4.x_to_5.0
> Ringkasan ini adalah terjemahan/adaptasi ringkas dari wiki Proxmox. Ikuti wiki resmi sebagai acuan utama.

---

## Ringkasan

Proxmox VE 5.x membawa perubahan besar (berbasis Debian 9 "Stretch"). Upgrade harus **direncanakan matang, diuji, dan butuh downtime**. **JANGAN PERNAH upgrade tanpa backup valid** dan tanpa uji coba di lingkungan lab.

Ada dua jalur migrasi 4.x → 5.x:

1. **Install baru** (hardware baru / reinstall ISO) lalu restore dari backup.
2. **In-place upgrade** via `apt-get` (langkah demi langkah).

> Setelah upgrade, kosongkan cache browser + reload GUI (kalau tidak, banyak tampilan glitch).

---

## Pra-syarat (In-place upgrade)

- Sudah di **PVE 4.4 versi terbaru**.
- Akses stabil ke semua storage yang dikonfigurasi.
- Cluster **sehat**.
- **Tidak ada VM/CT yang running** saat upgrade.
- **Backup valid semua VM** (wajib, untuk antisipasi gagal).
- Konfigurasi repository benar.
- Minimal **1 GB ruang kosong** di mount root.
- Partisi `/boot` (jika ada) cukup untuk kernel baru (**min 60 MB**) — hapus kernel lama bila perlu (`pveversion -v`).
- Jika pakai Ceph: sudah di versi **Luminous** sebelum upgrade.

---

## Langkah Demi Langkah (In-place)

Semua dijalankan di **command line tiap node** (console/SSH; lebih baik console agar tak terputus). Jangan ada perubahan guest selama proses.

### 1. Repositori lama → archive CDN

Rilis lama wajib pakai archive CDN (bukan repo live):

- `archive.debian.org` (bukan `*.debian.org`)
- `archive.proxmox.com` (bukan `*.proxmox.com`)

File: `/etc/apt/sources.list` dan `/etc/apt/sources.list.d/*.list`.
Jika ada error sertifikat saat `apt-get update`, pakai **HTTP** (bukan HTTPS).

### 2. Update ke PVE 4.4 terbaru dulu

```bash
apt-get update && apt-get dist-upgrade
```

### 3. Ubah repo `jessie` → `stretch`

```bash
sed -i 's/jessie/stretch/g' /etc/apt/sources.list
sed -i 's/jessie/stretch/g' /etc/apt/sources.list.d/pve-enterprise.list
```

### 4. Tambah key repo PVE 5.x

```bash
wget http://archive.proxmox.com/debian/proxmox-ve-release-5.x.gpg \
  -O /etc/apt/trusted.gpg.d/proxmox-ve-release-5.x.gpg
```

### 5. (Hanya jika Ceph) Ganti repo ceph.com → proxmox.com

```bash
echo "deb http://archive.proxmox.com/debian/ceph-luminous stretch main" > /etc/apt/sources.list.d/ceph.list
```

Hapus baris `backports` bila ada (upgrade belum diuji dengan paket backports).

### 6. Update data repository

```bash
apt-get update
```

### 7. Hapus SysVinit

```bash
apt purge insserv sysv-rc initscripts openrc
```

### 8. Dist-upgrade ke Debian Stretch + PVE 5.0

```bash
apt-get dist-upgrade
```

- Durasi: bisa **sampai 60 menit** (SSD bisa ~5 menit).
- Mungkin diminta konfirmasi replace file konfigurasi — pilih sesuai kebutuhan (tidak krusial untuk upgrade PVE).

### 9. Reboot

```bash
reboot
```

Gunakan kernel PVE baru.

---

## Troubleshooting

| Masalah | Solusi |
|---|---|
| Upgrade ke "stretch" gagal | Pastikan konfigurasi repo stretch benar. Jika gagal jaringan & upgrade parsial → `apt-get -fy install` |
| Gagal boot (grub) | Lihat wiki: *Recover_From_Grub_Failure* |

---

## Breaking Changes di 5.0

- **Display default berubah** dari `cirrus` → `std` (VGA standar Bochs VBE). `cirrus` punya bug keamanan; `std` default sejak QEMU 2.2.
- Untuk **live-migrate VM** dari PVE 4 ke PVE 5 **tanpa downtime**, pastikan node PVE 4 sudah `apt update && apt full-upgrade` dengan repo Jessie+PVE 4 valid (khususnya `qemu-server` ≥ `4.0-111`).

---

## Catatan Khusus pve3 (felixrohman31-a11y)

Status aktual node `pve3` (per 3 Sep 2026):

- **PVE 4.4** (`pve-manager/4.4-1`), **standalone** (bukan cluster), Debian 8 "Jessie".
- **26 guest**: 6 VM QEMU + 20 container LXC.
- Backup sudah dilakukan (`vzdump`) ke FTP `10.9.100.2` + lokal VG `storage` di `/mnt/pve-backup`.

**Catatan penting sebelum upgrade:**

1. **207 (deb8-88)** belum ter-backup — container ini di-start manual (`lxc-start -F`, bukan `pct start`), sehingga `vzdump` snapshot hang. Selesaikan backup 207 dulu (stop → `pct start` → `vzdump`) sebelum upgrade.
2. **Disk root 58% terpakai** (39 GB kosong) — memenuhi syarat minimal 1 GB.
3. `/boot/efi` hanya **252 MB, 1% terpakai** — cukup untuk kernel baru.
4. Stack PVE sempat wedge (pve-cluster SIGKILL 31 Agu → restart daemon sudah memulihkan). Pertimbangkan **reboot bersih + verifikasi `pveversion -v`** sebelum memulai dist-upgrade.
5. Karena mesin setua ini + 26 guest produksi, jalur **fresh-install PVE 8 + restore `vzdump`** sering lebih aman daripada 4 loncatan in-place (4→5→6→7→8). Upgrade ini (ke 5) hanya **langkah pertama**.

### Checklist aman sebelum dist-upgrade 4.4 → 5

- [ ] Backup **semua** VM/CT valid (termasuk 207).
- [ ] `apt-get update && apt-get dist-upgrade` → pastikan di 4.4 terbaru.
- [ ] Repo mengarah ke `archive.debian.org` + `archive.proxmox.com`.
- [ ] Siapkan akses **console** (bukan hanya SSH) untuk antisipasi putus koneksi.
- [ ] Siapkan jendela **downtime** (VM/CT mati saat upgrade).
- [ ] Catat isi `/etc/pve`, `/etc/network/interfaces`, `/etc/resolv.conf`, `/etc/passwd`.

---

## Referensi

- Wiki resmi: https://pve.proxmox.com/wiki/Upgrade_from_4.x_to_5.0
- Proxmox Package Repositories: https://pve.proxmox.com/wiki/Package_Repositories
- Backup & Restore: https://pve.proxmox.com/wiki/Backup_and_Restore

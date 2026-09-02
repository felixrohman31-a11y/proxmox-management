# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Sinkronisasi kode dengan klaim CHANGELOG 1.2.0/1.2.1: upload ISO/VMware kini
  `multipart/form-data` native via `https.request` (tanpa binary `curl`),
  rate limiting per-IP+per-cluster pada `/api/pve/[id]/[...path]` benar-benar
  diterapkan (60/menit mutasi, 120/menit GET; header `X-RateLimit-*`,
  `Retry-After`; nonaktif via `RATE_LIMIT_ENABLED=false`), dan mojibake em-dash
  (`â€”`) di `src/lib/pve.ts` dibersihkan menjadi `—`.

## [1.2.1] - 2026-08-31

### Added
- Fitur **SLA Monitoring**: target ketersediaan per VM/container dan node fisik (default 99.9%, bisa diatur khusus per entitas)
- Perhitungan SLA bulanan otomatis dari rrddata Proxmox — gap antar sampel dalam periode dianggap downtime; guest yang saat ini mati dihitung hanya sampai sampel terakhir
- Halaman dashboard baru **SLA Monitoring** (`/dashboard/sla`): ringkasan (rata-rata ketersediaan, kepatuhan, terendah, total downtime), tabel node & guest, editor target inline dengan reset
- API baru: `GET /api/sla/[id]` (hitung SLA per cluster per periode) dan `POST /api/sla/[id]` (atur/hapus target default & per-entitas, tercatat di audit log)
- **SLA masuk ke Laporan Bulanan** (TXT & HTML, per cluster maupun konsolidasi): baris ringkasan di seksi eksekutif + seksi SLA lengkap dengan tabel node/guest
- Laporan HTML kini **locale-aware penuh** (ID/EN): judul, tabel, grafik, tombol cetak, dan footer mengikuti bahasa — parameter `?locale=` pada endpoint laporan, dikirim otomatis oleh komponen unduh sesuai bahasa panel
- Blok **SLA Keseluruhan** (bobot 50% node + 30% guest + 20% task, target 99.5%) pada ringkasan laporan TXT & HTML
- Dukungan i18n penuh (ID/EN) untuk seluruh teks SLA
- Unit test perhitungan ketersediaan & validasi target (`src/lib/sla.test.ts`)

### Fixed
- `readAudit()` melewati baris audit berbentuk array (korup) dan filter periode kini null-safe
- `AuditTable` aman terhadap field null pada action/user/target
- Karakter UTF-8 yang rusak (em-dash/ellipsis → `???`) pada salinan produksi dibersihkan kembali ke karakter asli
- `package.json` version disamakan dengan tag release (0.1.0 → 1.2.1)

## [1.2.0] - 2026-08-29

### Security
- PBKDF2 (100k iterations, SHA-256) replaces raw key import in `src/lib/crypto-store.ts`
- Per-record salt (16 bytes) + IV + ciphertext stored as structured JSON
- Backward compatible — legacy encrypted data (old format) can still be decrypted automatically
- Unit test coverage: encrypt/decrypt roundtrip, wrong password rejection, salt uniqueness

### Added
- API Rate Limiting per IP + per cluster in `src/app/api/pve/[id]/[...path]/route.ts`
- Default: 60 req/min for mutating endpoints (POST/PUT/DELETE), 120 req/min for GET
- Standard response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`

### Fixed
- ISO upload no longer depends on `curl` binary — native `multipart/form-data` implementation via `undici` (PM-P4, upcoming release)

## [1.1.0] - 2026-08-28

### Added
- Import OVA/VMDK (VMware compatible) + fix checkbox autoStart
- MIT License, author, dan informasi free-to-use
- Laporan bulanan locale-aware (ID/EN berdasarkan cookie pc_lang)
- Language toggle ke menu Settings
- WaPanel i18n (PROVIDER_INFO pindah ke dalam komponen) + hapus sisa callmebot
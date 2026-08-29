# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
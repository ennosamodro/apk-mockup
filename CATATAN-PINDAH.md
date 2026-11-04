# Catatan: LMS PAC 1 — dari mockup ke repo final

Status sekarang: **MOCKUP** (repo public boleh, isi masih contoh).
Nanti kalau sudah cocok, pindah ke repo `apk` milik sendiri (dibuat Lenno) dengan versi yang aman.

## Checklist sebelum pindah ke repo final

- [ ] Repo final dibuat **private** (Vercel tetap bisa auto-deploy)
- [x] Kunci jawaban quiz & final exam **tidak ada di HTML**, dinilai di server (GAS) — sudah di mockup
- [x] Daftar kode akses hanya ada di Sheet `Users`, tidak pernah ditulis di file mana pun — sudah
- [x] `gas/` dan `sumber/` masuk `.gitignore` — sudah; cek lagi di repo final
- [ ] Sheet tidak di-share "Anyone with link"; GAS deploy "Execute as: Me"
- [x] Peran PT dicek di server, bukan cuma sembunyikan tab — sudah
- [x] Kode akses acak (`PAC-XXXXXX` via `isiKodeKosong`), bukan urut — sudah
- [ ] Ganti `API_URL` di `app.js` ke deployment final
- [ ] Hapus data dummy / kode akses mockup dari Sheet (U001, U002, P001)
- [ ] Ganti judul/branding kalau perlu, cek materi yang boleh tampil

## Arsitektur (disepakati)

- Frontend: `index.html` di GitHub → Vercel
- Backend: Google Apps Script web app (POST `text/plain`) + Google Sheets
- Satu layar login (kode akses); peran trainee / PT ditentukan dari sheet `Users`
- Sheets: `Users`, `Progress` (state terakhir per modul), `History` (append-only, track record per week), `Signoff`

# LMS PAC 1 — Alfa Prima Kimia (mockup)

Frontend statis (GitHub → Vercel) + backend Google Apps Script + Google Sheets.
Satu layar login pakai **kode akses**. Peran (trainee / PT) ditentukan dari sheet `Users`.

## Isi folder

| File | Di-push? | Isi |
|---|---|---|
| `index.html` | ya | tampilan, materi, diagram (**tanpa** kunci jawaban) |
| `app.js` | ya | logika aplikasi, login, simpan ke GAS |
| `tools/pisah-kunci.js` | ya | memisahkan kunci jawaban dari materi |
| `gas/Code.gs` | **tidak** | backend API |
| `gas/Kunci.gs` | **tidak** | kunci jawaban + pembahasan (dibuat otomatis) |
| `sumber/` | **tidak** | HTML asli yang masih berisi kunci |

## Setup (sekali)

1. Buat Google Sheet baru, misalnya "LMS PAC 1 — Data".
2. Buka **Extensions → Apps Script**. Tempel isi `gas/Code.gs` ke `Code.gs`, lalu bikin file baru `Kunci.gs` dan tempel isi `gas/Kunci.gs`.
3. Di editor Apps Script, pilih fungsi **`setup`** lalu klik **Run**, dan izinkan aksesnya. Ini membuat 4 sheet (`Users`, `Progress`, `History`, `Signoff`) dan 3 user contoh.
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   Salin URL `.../exec`.
5. Tempel URL itu di `app.js` baris `const API_URL = ...`.
6. Push ke GitHub, lalu hubungkan ke Vercel. Tidak perlu build command.

## Mengelola peserta (di sheet `Users`)

| id | kode | nama | peran | track | mulai | aktif |
|---|---|---|---|---|---|---|
| U001 | PAC-7K3QXA | Budi | trainee | Sales | 2026-11-02 | TRUE |
| P001 | PAC-M2R8TB | Pak Andi | pt | | | TRUE |

- **id** unik dan jangan diganti setelah dipakai, karena progres terikat ke id.
- **kode** dikosongkan saja, lalu jalankan fungsi **`isiKodeKosong`** supaya diisi kode acak. Kirim kode ke orangnya secara pribadi.
- **peran**: `trainee` atau `pt`. Untuk mencabut akses, isi **aktif** dengan `FALSE`.
- Perubahan di sheet `Users` terbaca paling lambat 1 menit kemudian.

## Data yang tercatat

- `Progress`: kondisi terakhir per orang per modul (skor quiz terbaik, esai, centang tugas). Baris `final` untuk final exam.
- `History`: **hanya ditambah, tidak pernah ditimpa**. Setiap percobaan quiz, exam, dan sign-off PT tercatat dengan waktu dan week. Ini yang jadi track record.
- `Signoff`: catatan dan status sign-off PT per modul.

## Keamanan yang sudah ada

- Quiz dan exam **dinilai di server**. Kunci jawaban baru dikirim ke browser setelah jawaban disubmit.
- Soal final exam diacak di server, dan jawaban hanya diterima untuk set soal itu (berlaku 6 jam).
- Trainee tidak bisa mengisi nilai sendiri. Endpoint `save` cuma menerima esai, tugas, dan profil.
- Kode akses tidak pernah dikirim balik ke browser. Dashboard PT memakai `id`, bukan kode.
- Data semua trainee dan sign-off hanya untuk peran `pt`, dan itu dicek di server.

## Kalau materi atau soal diubah

Edit file sumber di `sumber/lms-pac1-asli.html`, lalu jalankan:

```bash
node tools/pisah-kunci.js
```

Setelah itu tempel ulang `gas/Kunci.gs` ke Apps Script dan pilih **Deploy → Manage deployments → Edit → New version**. Jangan pilih "New deployment", karena URL-nya akan berubah.

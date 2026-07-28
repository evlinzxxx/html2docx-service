# html2docx-service

Layanan mikro kecil untuk mengonversi **HTML (teks + gambar) → DOCX**.
100% gratis, open source, jalan sendiri (self-hosted), tidak ada API key berbayar atau limit trial.

Dibangun dengan:
- [`@turbodocx/html-to-docx`](https://github.com/turbodocx/html-to-docx) — konversi murni JavaScript, tanpa LibreOffice/Chrome/headless browser
- Express — server HTTP sederhana

Gambar via URL eksternal (`<img src="https://...">`) otomatis diunduh dan disisipkan (embed) ke dalam file DOCX. Gambar base64 (`data:image/png;base64,...`) juga didukung langsung.

---

## 1. Cara menjalankan

### A. Lokal / VPS (butuh Node.js 18+)
```bash
npm install
npm start
```
Server jalan di `http://localhost:3000`.

### B. Docker (paling direkomendasikan)
```bash
docker compose up -d --build
```
atau manual:
```bash
docker build -t html2docx-service .
docker run -d -p 3000:3000 --name html2docx html2docx-service
```

### C. Platform gratis (Railway, Render, Fly.io, dsb.)
Cukup push folder ini ke repo GitHub, lalu hubungkan ke platform pilihanmu — semua platform tersebut otomatis mendeteksi `Dockerfile`.

---

## 2. Endpoint

### `GET /health`
Cek status service.

### `POST /convert`
Body (JSON):
```json
{
  "html": "<h1>Judul</h1><p>Ini <b>tebal</b> dan <img src=\"https://contoh.com/gambar.png\" /></p>",
  "filename": "laporan.docx"
}
```
Response: file `.docx` (binary), langsung bisa didownload/dipakai.

Header opsional `x-api-key` diperlukan **hanya jika** kamu mengisi environment variable `API_KEY` (lihat `.env.example`). Kalau dikosongkan, endpoint terbuka tanpa autentikasi — cocok kalau service ini hanya bisa diakses dari jaringan internal/n8n saja.

---

## 3. Integrasi dengan n8n

Tambahkan **HTTP Request node** dengan konfigurasi:

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `http://<host-service-kamu>:3000/convert` |
| Body Content Type | `JSON` |
| Body | `{ "html": "={{ $json.htmlContent }}", "filename": "laporan.docx" }` |
| Response Format | `File` (agar hasilnya jadi binary, bukan teks) |

Kalau kamu mengaktifkan `API_KEY`, tambahkan header:
```
x-api-key: <API_KEY_kamu>
```

Setelah itu, output HTTP Request node berupa binary `.docx` yang tinggal disambungkan ke node lain (Google Drive, Telegram, Email, Write Binary File, dll).

---

## 4. Catatan konversi HTML → DOCX

Elemen HTML yang didukung dengan baik: `h1`-`h6`, `p`, `b`/`strong`, `i`/`em`, `ul`/`ol`/`li`, `table`/`tr`/`td`/`th`, `img`, `br`, `a`.

CSS inline sederhana (warna, bold, italic, alignment) umumnya terbawa; CSS kompleks (flexbox, grid, animasi) tidak relevan karena DOCX bukan format berbasis browser rendering.

---

## 5. Keamanan

- Set `API_KEY` di `.env` kalau service ini terekspos ke internet publik.
- Batasi akses jaringan (firewall/security group) supaya hanya n8n yang bisa mengakses port ini, terutama kalau tidak pakai API key.

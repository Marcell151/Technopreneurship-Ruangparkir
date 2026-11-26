# RuangParkir — Aplikasi Web Responsif (PWA) Marketplace Parkir Komunitas

**"Berbagi Ruang, Parkir Lebih Tenang."**  
Sistem aplikasi nyata berbasis **PHP 8 + MySQL (`db_parkir`) + PWA Responsif** untuk proyek UAS Mata Kuliah Technopreneurship (SSI4143) — Universitas Ma Chung.

## Fitur Utama Sistem Nyata
- **Peta Nyata Leaflet.js + OpenStreetMap + GPS Geolocation**: Peta interaktif koordinat asli Kota Malang, tombol **Lokasi Saya (GPS)** dengan perhitungan jarak Haversine real-time, serta tombol **Rute Google Maps**.
- **Payment Gateway Midtrans Snap (Live Sandbox)**: Terintegrasi langsung ke API Midtrans ([api/midtrans.php](api/midtrans.php)) untuk pembayaran reservasi parkir (QRIS / GoPay / VA Bank / Kartu), Top Up RuangPay, dan pembelian RuangPass, lengkap dengan verifikasi status ke Midtrans Core API & endpoint Webhook SHA-512.
- **Tombol Akses Cepat Login (1-Klik)**: Tersedia 3 tombol cepat di halaman Login (Pengemudi, Pemilik Lahan, Juru Parkir) yang tetap melalui autentikasi API `bcrypt` & sesi PHP asli.
- **Mode Tampilan Ganda (Default Web Responsif Penuh + Tombol `Mode HP`)**: Tampil penuh & luas pada laptop/desktop dengan tata letak 2 kolom, dilengkapi tombol **Mode HP** 1-klik di navbar untuk pratinjau ukuran smartphone (`390×844`), dan otomatis layar penuh di HP asli.
- **Autentikasi & RBAC Asli (Tanpa Ganti Akun Instan)**: Login & registrasi dengan hash `bcrypt`, sesi PHP aman, pembatasan hak akses ketat per peran di server (`DRIVER`, `LANDOWNER`, `ATTENDANT`), edit profil & ganti PIN, serta logout.
- **Alur Transaksi Lengkap Lintas 3 Peran**:
  - **Pengemudi**: Cari garasi di peta, filter kendaraan, promo UMKM sekitar, reservasi deposit flat 1–3 jam + Biaya Layanan Rp1.000, kode promo bebas fee (`HEMAT1K`), langganan **RuangPass** (`Rp55.000/20x motor`), batalkan pesanan + refund otomatis, hubungi jukir, dan ulasan bintang 1–5 (otomatis *QC flag* jika `< 3` bintang).
  - **Pemilik Lahan**: Kontrol Buka/Tutup garasi, tambah garasi baru, atur kuota slot Mobil/Motor, pantau kendaraan aktif real-time, mutasi bagi hasil **40% utuh**, dan tarik dana (min. Rp50.000).
  - **Juru Parkir**: Terminal Pos Scanner QR + verifikasi manual kode booking cadangan, argometer server-side, dan settlement otomatis **40:40:20 + Fee Rp1.000** sesuai Tabel 10.1.

## Instalasi di XAMPP
1. Aktifkan **Apache** & **MySQL** di XAMPP.
2. Import `database/db_parkir.sql` di phpMyAdmin (membuat database `db_parkir`).
3. Akses `http://localhost/technopreneurship-ruangparkir/`.

## Akun Awal di Database (`PIN: 123456`)
| Peran | Nomor HP | Email |
|---|---|---|
| **Pengemudi (Driver)** | `081298765432` | `budi.santoso@gmail.com` |
| **Pemilik Lahan** | `081122334455` | `garasi.wijaya@gmail.com` |
| **Juru Parkir (Jukir)** | `087899887766` | `slamet.pos01@gmail.com` |

## Arsip
Seluruh file prototype statis & laporan HTML UAS tersimpan di folder `Prototype dan Laporan/`.

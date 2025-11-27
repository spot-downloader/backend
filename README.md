# Backend Spotify Downloader

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org/)
[![Redis](https://img.shields.io/badge/redis-%3E%3D7.0-red)](https://redis.io/)

Backend service untuk download musik berdasarkan metadata dari Spotify menggunakan Express.js, Redis, dan youtube-dl.

## 🎵 Cara Kerja

1. **Ambil Metadata** dari Spotify API (nama track, artist, album)
2. **Cari & Download** audio dari YouTube menggunakan `youtube-dl-exec`
3. **Queue System** dengan Redis untuk handle multiple downloads
4. **Download** hasil dalam format MP3/M4A

**Catatan Penting:** 
- Aplikasi ini **TIDAK** download langsung dari Spotify
- Spotify API hanya digunakan untuk mendapatkan informasi track/album/playlist
- Audio didownload dari YouTube berdasarkan metadata tersebut
- Untuk playlist/album public, tidak perlu Spotify API key (coming soon)
- Untuk playlist private, diperlukan Spotify API credentials

## ⚖️ Disclaimer

Aplikasi ini dibuat untuk **tujuan edukasi dan personal use**. Pengguna bertanggung jawab penuh atas penggunaan aplikasi ini. Pastikan Anda:
- Memiliki hak untuk download konten yang Anda pilih
- Mematuhi copyright dan Terms of Service platform terkait
- Tidak menggunakan untuk distribusi komersial tanpa izin

## ✨ Features

- ✅ Download single track
- ✅ Download full album
- ✅ Download playlist (public & private)
- ✅ Background job processing dengan Redis Queue
- ✅ Real-time download progress
- ✅ Automatic metadata tagging
- ✅ ZIP download untuk multiple tracks
- ✅ Docker support

## Prerequisites

- Node.js 16+ (untuk instalasi tanpa Docker)
- Redis Server (untuk instalasi tanpa Docker)
- Docker & Docker Compose (untuk instalasi dengan Docker)
- Spotify Developer Account (untuk mendapatkan Client ID dan Client Secret)

## Konfigurasi Spotify API

1. Buka [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Login atau buat akun baru
3. Klik "Create an App"
4. Isi nama aplikasi dan deskripsi
5. Setelah dibuat, Anda akan mendapatkan **Client ID** dan **Client Secret**
6. Simpan credentials ini untuk digunakan di file `.env`

## Instalasi

### Opsi 1: Tanpa Docker (Manual)

#### 1. Install Dependencies

```sh
npm install
```

#### 2. Install Redis Server

**Ubuntu/Debian:**
```sh
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

**macOS:**
```sh
brew install redis
brew services start redis
```

**Windows:**
Download dan install dari [Redis Windows](https://github.com/microsoftarchive/redis/releases)

#### 3. Konfigurasi Environment Variables

Copy file `.env.example` ke `.env`:
```sh
cp .env.example .env
```

Edit file `.env` dan isi dengan kredensial Spotify Anda:
```env
SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here

PORT=3081
NODE_ENV=development

CORS_ORIGINS=http://localhost:5173,http://localhost:3080

# Redis Configuration (untuk instalasi manual)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

#### 4. Jalankan Aplikasi

**Terminal 1 - Backend Server:**
```sh
npm run dev
```

**Terminal 2 - Worker (untuk processing download):**
```sh
npm run worker
```

Backend akan berjalan di `http://localhost:3081`

---

### Opsi 2: Dengan Docker

#### 1. Konfigurasi Environment Variables

Copy file `.env.example` ke `.env`:
```sh
cp .env.example .env
```

Edit file `.env` dan isi dengan kredensial Spotify Anda:
```env
SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here

PORT=3081
NODE_ENV=production

CORS_ORIGINS=http://localhost:3080,https://yourdomain.com
```

#### 2. Build dan Jalankan dengan Docker Compose

```sh
docker-compose up -d
```

Atau untuk rebuild image:
```sh
docker-compose up -d --build
```

#### 3. Cek Status Container

```sh
docker-compose ps
```

#### 4. Lihat Logs

```sh
# Semua services
docker-compose logs -f

# Backend saja
docker-compose logs -f backend

# Worker saja
docker-compose logs -f worker

# Redis saja
docker-compose logs -f redis
```

#### 5. Stop Services

```sh
docker-compose down
```

Untuk menghapus volumes (data Redis dan downloads):
```sh
docker-compose down -v
```

---

## Endpoints API

### POST /download
Download track/album/playlist dari Spotify

**Request Body:**
```json
{
  "url": "https://open.spotify.com/track/..."
}
```

**Response:**
```json
{
  "jobId": "uuid-job-id",
  "message": "Job ditambahkan ke queue"
}
```

### GET /status/:jobId
Cek status download job

**Response:**
```json
{
  "status": "completed|processing|failed",
  "progress": 75,
  "total": 10,
  "current": 7
}
```

### GET /download/:jobId
Download file hasil

---

## Troubleshooting

### Redis Connection Error
Pastikan Redis sudah berjalan:
```sh
# Cek status Redis
redis-cli ping
# Seharusnya return: PONG
```

### Port Already in Use
Ganti PORT di file `.env` atau hentikan aplikasi yang menggunakan port tersebut

### Worker Tidak Processing
Pastikan worker sudah running dan Redis terhubung dengan baik

---

## Development

### Hot Reload Development
```sh
npm run dev
```

### Production Mode
```sh
npm start
```

### Run Worker
```sh
npm run worker
```

---

## License

GPL-3.0-or-later

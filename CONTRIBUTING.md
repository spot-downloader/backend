# Contributing to Backend Spotify Downloader

Terima kasih atas minat Anda untuk berkontribusi pada proyek ini! 🎉

## Cara Berkontribusi

### Melaporkan Bug

Jika Anda menemukan bug, silakan buat issue baru dengan informasi berikut:

1. **Deskripsi jelas** tentang masalahnya
2. **Langkah-langkah untuk mereproduksi** bug
3. **Perilaku yang diharapkan** vs **perilaku aktual**
4. **Environment** (OS, Node.js version, dll)
5. **Screenshots** jika relevan

### Mengajukan Fitur Baru

Untuk fitur baru, buat issue dengan label "enhancement" yang menjelaskan:

1. Apa yang ingin Anda tambahkan
2. Mengapa fitur ini berguna
3. Bagaimana Anda membayangkan implementasinya

### Pull Request Process

1. **Fork repository** ini
2. **Clone** fork Anda: `git clone https://github.com/YOUR_USERNAME/backend-spotifydownloader.git`
3. **Buat branch** baru: `git checkout -b feature/nama-fitur-anda`
4. **Install dependencies**: `npm install`
5. **Buat perubahan** Anda
6. **Test** perubahan Anda secara menyeluruh
7. **Commit** dengan pesan yang jelas: `git commit -m "Add: fitur xyz"`
8. **Push** ke branch Anda: `git push origin feature/nama-fitur-anda`
9. **Buat Pull Request** ke branch `main`

### Commit Message Guidelines

Gunakan format berikut untuk commit message:

```
Add: menambahkan fitur baru
Fix: memperbaiki bug
Update: memperbarui fitur yang ada
Remove: menghapus fitur/file
Refactor: refactoring code tanpa mengubah fungsionalitas
Docs: update dokumentasi
Style: perubahan formatting, whitespace, dll
```

Contoh:
```
Add: support untuk download dari Spotify playlist
Fix: error saat download album dengan special characters
Update: improve error handling di worker.js
```

### Code Style

- Gunakan **2 spaces** untuk indentasi (bukan tabs)
- Gunakan **camelCase** untuk variable dan function names
- Gunakan **PascalCase** untuk class names
- Tambahkan **comments** untuk logic yang kompleks
- Gunakan **async/await** daripada callbacks
- Handle errors dengan proper **try-catch**

### Testing

Sebelum submit PR, pastikan:

- [ ] Code berjalan tanpa error
- [ ] Semua endpoint API masih bekerja
- [ ] Redis connection berfungsi
- [ ] Worker dapat memproses jobs
- [ ] Tidak ada credentials yang ter-commit
- [ ] File `.env.example` sudah di-update jika ada perubahan environment variables

### Development Setup

```bash
# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env dengan credentials Anda

# Start Redis
redis-server

# Run backend (terminal 1)
npm run dev

# Run worker (terminal 2)
npm run worker
```

### Apa yang TIDAK boleh di-commit

- ❌ File `.env` dengan credentials asli
- ❌ File di folder `node_modules/`
- ❌ File di folder `downloads/` (kecuali struktur folder kosong)
- ❌ API keys, tokens, atau secrets
- ❌ File temporary atau log

### Project Structure

```
backend-spotifydownloader/
├── index.js          # Main Express server
├── worker.js         # Background job processor
├── jobs/
│   └── jobs.js       # Job queue management
├── downloads/        # Downloaded files (ignored by git)
├── .env.example      # Environment template
└── README.md         # Documentation
```

### Need Help?

Jika Anda memiliki pertanyaan, silakan:

1. Cek [README.md](README.md) terlebih dahulu
2. Cari di [Issues](https://github.com/rohidtzz/backend-spotifydownloader/issues) yang sudah ada
3. Buat issue baru jika belum ada jawaban

## Code of Conduct

Proyek ini mengadopsi standar perilaku yang ramah dan inklusif. Dengan berpartisipasi, Anda diharapkan untuk:

- Menggunakan bahasa yang ramah dan inklusif
- Menghormati sudut pandang dan pengalaman yang berbeda
- Menerima kritik konstruktif dengan baik
- Fokus pada yang terbaik untuk komunitas
- Menunjukkan empati terhadap anggota komunitas lainnya

## License

Dengan berkontribusi, Anda setuju bahwa kontribusi Anda akan dilisensikan di bawah GPL-3.0-or-later License yang sama dengan proyek ini.

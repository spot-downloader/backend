# Security Policy

## Supported Versions

Kami saat ini mendukung versi berikut dengan security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

Jika Anda menemukan vulnerability keamanan di project ini, mohon **JANGAN** membuat public issue.

Sebagai gantinya, silakan laporkan secara privat dengan cara:

1. **Email** ke security contact (bisa ditambahkan email Anda)
2. Atau gunakan **GitHub Security Advisories**:
   - Buka tab "Security" di repository
   - Klik "Report a vulnerability"
   - Isi form dengan detail vulnerability

### Informasi yang Perlu Disertakan

- Deskripsi vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (jika ada)

### Response Timeline

- **Initial Response**: Dalam 48 jam
- **Investigation**: 1-2 minggu
- **Fix & Disclosure**: Tergantung severity, kami akan:
  - Develop dan test fix
  - Release patch version
  - Publish security advisory
  - Credit reporter (jika diinginkan)

## Security Best Practices untuk Pengguna

1. **Jangan commit file `.env`** dengan credentials asli
2. **Regenerate API keys** secara berkala
3. **Update dependencies** secara teratur: `npm audit fix`
4. **Gunakan environment variables** untuk semua secrets
5. **Enable firewall** untuk Redis jika expose ke internet
6. **Gunakan HTTPS** untuk production deployment
7. **Limit CORS origins** ke domain yang dipercaya saja

## Known Security Considerations

- Aplikasi ini menggunakan `youtube-dl-exec` yang mengeksekusi command eksternal
- Redis tanpa authentication di local development (production harus pakai password)
- Rate limiting belum diimplementasikan (bisa DDoS)

## Dependency Security

Kami secara aktif monitor dependencies untuk known vulnerabilities:

```bash
# Check for vulnerabilities
npm audit

# Auto-fix non-breaking changes
npm audit fix
```

Jika Anda menemukan dependency dengan vulnerability, silakan buat issue atau PR.

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-11-27

### Added
- Initial release
- Express.js backend API
- Redis queue system for background jobs
- Spotify API integration untuk metadata
- YouTube download menggunakan youtube-dl-exec
- Support untuk single track, album, dan playlist
- Real-time progress tracking
- ZIP download untuk multiple files
- Docker support dengan docker-compose
- Complete documentation (README, CONTRIBUTING, SECURITY)

### Features
- POST /download - Create download job
- GET /status/:jobId - Check job status
- GET /download/:jobId - Download completed files
- Background worker untuk processing jobs
- Automatic retry mechanism
- Error handling dan logging

[1.0.0]: https://github.com/rohidtzz/backend-spotifydownloader/releases/tag/v1.0.0

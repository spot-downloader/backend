const Redis = require('ioredis');
const SpotifyWebApi = require("spotify-web-api-node");
const fs = require("fs");
const path = require("path");
const youtubedl = require('youtube-dl-exec');

const dotenv = require("dotenv");
dotenv.config();

// Redis configuration
const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    }
});

// Publisher for progress updates
const publisher = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
});

publisher.on('connect', () => {
    console.log('✅ Publisher connected to Redis');
});

publisher.on('error', (err) => {
    console.error('❌ Publisher Redis error:', err);
});

// Function to publish progress
async function publishProgress(jobId, data) {
    const channel = `progress:${jobId}`;
    try {
        const result = await publisher.publish(channel, JSON.stringify(data));
        console.log(`📡 Published to ${channel}: ${data.message || data.type} (subscribers: ${result})`);
    } catch (err) {
        console.error(`❌ Failed to publish to ${channel}:`, err);
    }
}

redis.on('connect', () => {
    console.log('✅ Connected to Redis');
});

redis.on('error', (err) => {
    console.error('❌ Redis connection error:', err);
});

const OUTPUT_ROOT = path.join(".", "downloads");
const PLAYLIST_FOLDER = path.join(OUTPUT_ROOT, "playlist");
const TRACK_FOLDER = path.join(OUTPUT_ROOT, "track");
const ALBUM_FOLDER = path.join(OUTPUT_ROOT, "album");
const ARTIST_FOLDER = path.join(OUTPUT_ROOT, "artist");

[OUTPUT_ROOT, PLAYLIST_FOLDER, TRACK_FOLDER, ALBUM_FOLDER, ARTIST_FOLDER].forEach(folder => {
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
});

const spotifyApi = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
});

// Ambil token akses client credentials
async function getAccessToken() {
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(data.body.access_token);
}

function sanitizeFilename(name) {
    return name.replace(/[\\/:"*?<>|]+/g, "");
}

function downloadTrack(query, folder) {
    return youtubedl(`ytsearch1:${query}`,
        {
            extractAudio: true,
            audioFormat: 'mp3',
            output: `${folder}/%(title)s.%(ext)s`
        }
    );
}

// Fungsi untuk cek apakah file MP3 sudah ada di folder
function checkIfFileExists(trackName, artist, folder) {
    if (!fs.existsSync(folder)) return false;
    
    const files = fs.readdirSync(folder);
    // Cari file yang mengandung nama track dan artist (case insensitive)
    const searchTerm = `${trackName} ${artist}`.toLowerCase();
    
    return files.some(file => {
        if (!file.endsWith('.mp3')) return false;
        return file.toLowerCase().includes(trackName.toLowerCase()) || 
               file.toLowerCase().includes(artist.toLowerCase()) ||
               file.toLowerCase().includes(searchTerm);
    });
}

async function processJobs(){
    // Ambil job pertama dari queue tanpa menghapusnya dulu
    const jobStr = await redis.lindex('jobs:downloader', 0);
    if (!jobStr) return;

    let job;
    try {
        job = JSON.parse(jobStr);
    } catch (e) {
        console.error('Invalid job format:', jobStr);
        await redis.lpop('jobs:downloader');
        return;
    }

    // Skip jika job sudah processing (worker lain mungkin sedang mengerjakan)
    if (job.status === 'processing') {
        return;
    }

    // Skip jika job bukan pending
    if (job.status !== 'pending') {
        await redis.lpop('jobs:downloader');
        return;
    }

    // Ambil job dari queue (remove dari depan) dan simpan untuk diproses
    await redis.lpop('jobs:downloader');
    
    // Update status ke processing
    job.status = 'processing';
    job.updatedAt = Date.now();
    
    // Simpan job yang sedang diproses di key terpisah
    await redis.set(`job:processing:${job.id}`, JSON.stringify(job));

    console.log('processing  \n');
    
    // Publish initial progress
    await publishProgress(job.id, {
        status: 'processing',
        type: 'started',
        message: 'Memulai proses download...',
        progress: 0,
        total: 1,
        current: 0
    });

    try {
        await getAccessToken();
        
        if (job.url.includes("track/")) {
            const trackId = job.url.split("track/")[1].split("?")[0];
            const track = await spotifyApi.getTrack(trackId);
            const trackName = sanitizeFilename(track.body.name);
            const artist = sanitizeFilename(track.body.artists[0].name);
            const folder = path.join(TRACK_FOLDER, `${trackName} - ${artist}`);
            if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

            const name = trackName + ' - ' + artist;
            job.payload = name;

            await publishProgress(job.id, {
                status: 'processing',
                type: 'downloading',
                message: `Downloading: ${trackName} - ${artist}`,
                currentTrack: `${trackName} - ${artist}`,
                progress: 0,
                total: 1,
                current: 0
            });

            // Cek apakah file sudah ada
            if (checkIfFileExists(trackName, artist, folder)) {
                console.log(`✅ File sudah ada, skip download: ${trackName} - ${artist} \n`);
                await publishProgress(job.id, {
                    status: 'processing',
                    type: 'skipped',
                    message: `File sudah ada: ${trackName} - ${artist}`,
                    progress: 100,
                    total: 1,
                    current: 1
                });
            } else {
                console.log(`⬇️ Downloading : ${trackName} - ${artist} \n`);
                await downloadTrack(`${trackName} ${artist}`, folder);
                await publishProgress(job.id, {
                    status: 'processing',
                    type: 'downloaded',
                    message: `Selesai: ${trackName} - ${artist}`,
                    progress: 100,
                    total: 1,
                    current: 1
                });
            }

        } else if (job.url.includes("playlist/")) {
            const playlistId = job.url.split("playlist/")[1].split("?")[0];
            const playlist = await spotifyApi.getPlaylist(playlistId);
            const playlistName = sanitizeFilename(playlist.body.name);
            const folder = path.join(PLAYLIST_FOLDER, playlistName);
            if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
            
            const tracks = playlist.body.tracks.items.map(item => ({
                name: item.track.name,
                artist: item.track.artists[0].name,
            }));

            job.payload = playlistName;

            console.log(`🎵 Processing playlist: ${playlistName} (${tracks.length} tracks)`);
            
            await publishProgress(job.id, {
                status: 'processing',
                type: 'info',
                message: `Memproses playlist: ${playlistName}`,
                playlistName,
                progress: 0,
                total: tracks.length,
                current: 0
            });

            for (let j = 0; j < tracks.length; j++) {
                const t = tracks[j];
                const trackNum = j + 1;
                
                // Skip jika file sudah ada
                if (checkIfFileExists(t.name, t.artist, folder)) {
                    console.log(`✅ Skip (${trackNum}/${tracks.length}): ${t.name} - ${t.artist} (sudah ada)`);
                    await publishProgress(job.id, {
                        status: 'processing',
                        type: 'skipped',
                        message: `Skip (${trackNum}/${tracks.length}): ${t.name} - ${t.artist} (sudah ada)`,
                        currentTrack: `${t.name} - ${t.artist}`,
                        progress: Math.round((trackNum / tracks.length) * 100),
                        total: tracks.length,
                        current: trackNum
                    });
                    continue;
                }
                
                console.log(`Downloading (${trackNum}/${tracks.length}): ${t.name} - ${t.artist}`);
                
                await publishProgress(job.id, {
                    status: 'processing',
                    type: 'downloading',
                    message: `Downloading (${trackNum}/${tracks.length}): ${t.name} - ${t.artist}`,
                    currentTrack: `${t.name} - ${t.artist}`,
                    progress: Math.round((j / tracks.length) * 100),
                    total: tracks.length,
                    current: trackNum
                });
                
                try {
                    await downloadTrack(`${t.name} ${t.artist}`, folder);
                    await publishProgress(job.id, {
                        status: 'processing',
                        type: 'downloaded',
                        message: `Selesai (${trackNum}/${tracks.length}): ${t.name} - ${t.artist}`,
                        currentTrack: `${t.name} - ${t.artist}`,
                        progress: Math.round((trackNum / tracks.length) * 100),
                        total: tracks.length,
                        current: trackNum
                    });
                } catch (trackError) {
                    console.log(`   ❌ Failed: ${trackError.message}`);
                    await publishProgress(job.id, {
                        status: 'processing',
                        type: 'track_failed',
                        message: `Gagal (${trackNum}/${tracks.length}): ${t.name} - ${t.artist}`,
                        currentTrack: `${t.name} - ${t.artist}`,
                        error: trackError.message,
                        progress: Math.round((trackNum / tracks.length) * 100),
                        total: tracks.length,
                        current: trackNum
                    });
                }
            }

            console.log('✅ Playlist processing completed\n');

        } else if (job.url.includes("album/")) {
            const albumId = job.url.split("album/")[1].split("?")[0];
            const album = await spotifyApi.getAlbum(albumId);
            const albumName = sanitizeFilename(album.body.name);
            const folder = path.join(ALBUM_FOLDER, albumName);
            if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

            const tracks = album.body.tracks.items.map(track => ({
                name: track.name,
                artist: track.artists[0].name,
            }));

            job.payload = albumName;

            console.log(`🎵 Processing album: ${albumName} (${tracks.length} tracks)`);
            
            await publishProgress(job.id, {
                status: 'processing',
                type: 'info',
                message: `Memproses album: ${albumName}`,
                albumName,
                progress: 0,
                total: tracks.length,
                current: 0
            });

            for (let j = 0; j < tracks.length; j++) {
                const t = tracks[j];
                const trackNum = j + 1;
                
                // Skip jika file sudah ada
                if (checkIfFileExists(t.name, t.artist, folder)) {
                    console.log(`✅ Skip (${trackNum}/${tracks.length}): ${t.name} - ${t.artist} (sudah ada)`);
                    await publishProgress(job.id, {
                        status: 'processing',
                        type: 'skipped',
                        message: `Skip (${trackNum}/${tracks.length}): ${t.name} - ${t.artist} (sudah ada)`,
                        currentTrack: `${t.name} - ${t.artist}`,
                        progress: Math.round((trackNum / tracks.length) * 100),
                        total: tracks.length,
                        current: trackNum
                    });
                    continue;
                }
                
                console.log(`Downloading (${trackNum}/${tracks.length}): ${t.name} - ${t.artist}`);

                await publishProgress(job.id, {
                    status: 'processing',
                    type: 'downloading',
                    message: `Downloading (${trackNum}/${tracks.length}): ${t.name} - ${t.artist}`,
                    currentTrack: `${t.name} - ${t.artist}`,
                    progress: Math.round((j / tracks.length) * 100),
                    total: tracks.length,
                    current: trackNum
                });

                try {
                    await downloadTrack(`${t.name} ${t.artist}`, folder);
                    await publishProgress(job.id, {
                        status: 'processing',
                        type: 'downloaded',
                        message: `Selesai (${trackNum}/${tracks.length}): ${t.name} - ${t.artist}`,
                        currentTrack: `${t.name} - ${t.artist}`,
                        progress: Math.round((trackNum / tracks.length) * 100),
                        total: tracks.length,
                        current: trackNum
                    });
                } catch (trackError) {
                    console.log(`   ❌ Failed: ${trackError.message}`);
                    await publishProgress(job.id, {
                        status: 'processing',
                        type: 'track_failed',
                        message: `Gagal (${trackNum}/${tracks.length}): ${t.name} - ${t.artist}`,
                        currentTrack: `${t.name} - ${t.artist}`,
                        error: trackError.message,
                        progress: Math.round((trackNum / tracks.length) * 100),
                        total: tracks.length,
                        current: trackNum
                    });
                }
            }

            console.log('✅ Album processing completed\n');

        } else if (job.url.includes("artist/")) {
            const artistId = job.url.split("artist/")[1].split("?")[0];
            const artist = await spotifyApi.getArtist(artistId);
            const artistName = sanitizeFilename(artist.body.name);
            const folder = path.join(ARTIST_FOLDER, artistName);
            if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

            // Get top tracks
            const topTracks = await spotifyApi.getArtistTopTracks(artistId, 'US');
            const tracks = topTracks.body.tracks.map(track => ({
                name: track.name,
                artist: artistName,
            }));

            job.payload = artistName;

            console.log(`🎵 Processing artist: ${artistName} (${tracks.length} top tracks)`);
            
            await publishProgress(job.id, {
                status: 'processing',
                type: 'info',
                message: `Memproses artist: ${artistName} (${tracks.length} top tracks)`,
                artistName,
                progress: 0,
                total: tracks.length,
                current: 0
            });

            for (let j = 0; j < tracks.length; j++) {
                const t = tracks[j];
                const trackNum = j + 1;
                
                // Skip jika file sudah ada
                if (checkIfFileExists(t.name, t.artist, folder)) {
                    console.log(`✅ Skip (${trackNum}/${tracks.length}): ${t.name} - ${t.artist} (sudah ada)`);
                    await publishProgress(job.id, {
                        status: 'processing',
                        type: 'skipped',
                        message: `Skip (${trackNum}/${tracks.length}): ${t.name} - ${t.artist} (sudah ada)`,
                        currentTrack: `${t.name} - ${t.artist}`,
                        progress: Math.round((trackNum / tracks.length) * 100),
                        total: tracks.length,
                        current: trackNum
                    });
                    continue;
                }
                
                console.log(`Downloading (${trackNum}/${tracks.length}): ${t.name} - ${t.artist}`);

                await publishProgress(job.id, {
                    status: 'processing',
                    type: 'downloading',
                    message: `Downloading (${trackNum}/${tracks.length}): ${t.name} - ${t.artist}`,
                    currentTrack: `${t.name} - ${t.artist}`,
                    progress: Math.round((j / tracks.length) * 100),
                    total: tracks.length,
                    current: trackNum
                });

                try {
                    await downloadTrack(`${t.name} ${t.artist}`, folder);
                    await publishProgress(job.id, {
                        status: 'processing',
                        type: 'downloaded',
                        message: `Selesai (${trackNum}/${tracks.length}): ${t.name} - ${t.artist}`,
                        currentTrack: `${t.name} - ${t.artist}`,
                        progress: Math.round((trackNum / tracks.length) * 100),
                        total: tracks.length,
                        current: trackNum
                    });
                } catch (trackError) {
                    console.log(`   ❌ Failed: ${trackError.message}`);
                    await publishProgress(job.id, {
                        status: 'processing',
                        type: 'track_failed',
                        message: `Gagal (${trackNum}/${tracks.length}): ${t.name} - ${t.artist}`,
                        currentTrack: `${t.name} - ${t.artist}`,
                        error: trackError.message,
                        progress: Math.round((trackNum / tracks.length) * 100),
                        total: tracks.length,
                        current: trackNum
                    });
                }
            }

            console.log('✅ Artist processing completed\n');

        } else {
            console.log('invalid url:', job.url);
            await publishProgress(job.id, {
                status: 'failed',
                type: 'error',
                message: 'URL tidak valid',
                progress: 0
            });
        }

    } catch (err) {
        console.error('Error processing job:', err);

        // Mark as failed immediately
        job.status = 'failed';
        job.error = err.message;
        job.updatedAt = Date.now();
        
        console.log("job failed \n\n");
        
        await publishProgress(job.id, {
            status: 'failed',
            type: 'failed',
            message: `Download gagal: ${err.message}`,
            error: err.message
        });
        
        // Remove from processing key dan pindahkan ke failed queue
        await redis.del(`job:processing:${job.id}`);
        await redis.lpush('jobs:failed', JSON.stringify(job));
        return;
    }

    // Mark as done and remove from queue
    job.status = 'done';
    job.updatedAt = Date.now();
    console.log("done \n\n");
    
    await publishProgress(job.id, {
        status: 'done',
        type: 'completed',
        message: 'Download selesai!',
        payload: job.payload,
        progress: 100
    });
    
    // Remove from processing key and add to completed
    await redis.del(`job:processing:${job.id}`);
    await redis.lpush('jobs:completed', JSON.stringify(job));
}

// Graceful shutdown function
async function gracefulShutdown(signal) {
    console.log(`\n🛑 Worker shutting down (${signal})...`);
    
    try {
        // Find all processing jobs and put them back to queue
        const keys = await redis.keys('job:processing:*');
        let resetCount = 0;
        
        for (const key of keys) {
            const jobStr = await redis.get(key);
            if (!jobStr) continue;
            
            try {
                const job = JSON.parse(jobStr);
                job.status = 'pending';
                // Put back to queue for retry
                await redis.rpush('jobs:downloader', JSON.stringify(job));
                await redis.del(key);
                resetCount++;
            } catch (e) {
                console.error('Error parsing job during shutdown:', e);
            }
        }
        
        if (resetCount > 0) {
            console.log(`🔄 Reset ${resetCount} processing jobs to pending`);
        }
        
        // Close Redis connections
        await publisher.quit();
        await redis.quit();
        console.log('📦 Redis connections closed');
        
    } catch (error) {
        console.error('❌ Error during shutdown:', error.message);
    }
    
    console.log('✅ Worker shutdown complete');
    process.exit(0);
}

// Handle different shutdown signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));     // Ctrl+C
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));   // Termination request
process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));   // Quit signal

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', async (error) => {
    console.error('💥 Uncaught Exception:', error);
    await gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', async (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    await gracefulShutdown('UNHANDLED_REJECTION');
});

// Cleanup old completed jobs (older than 24 hours)
async function cleanupOldJobs() {
    try {
        const completedLength = await redis.llen('jobs:completed');
        if (completedLength === 0) return;
        
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        // Get all completed jobs
        const jobs = [];
        for (let i = 0; i < completedLength; i++) {
            const jobStr = await redis.lindex('jobs:completed', i);
            if (jobStr) {
                try {
                    jobs.push(JSON.parse(jobStr));
                } catch (e) {}
            }
        }
        
        // Filter jobs to keep (less than 24 hours old)
        const jobsToKeep = jobs.filter(job => {
            const age = now - (job.updatedAt || job.createdAt || 0);
            return age < maxAge;
        });
        
        const removed = jobs.length - jobsToKeep.length;
        
        if (removed > 0) {
            // Clear and re-add only jobs to keep
            await redis.del('jobs:completed');
            for (const job of jobsToKeep) {
                await redis.rpush('jobs:completed', JSON.stringify(job));
            }
            console.log(`🧹 Cleaned up ${removed} old completed jobs`);
        }
        
        // Also cleanup failed jobs older than 24 hours
        const failedLength = await redis.llen('jobs:failed');
        if (failedLength > 0) {
            const failedJobs = [];
            for (let i = 0; i < failedLength; i++) {
                const jobStr = await redis.lindex('jobs:failed', i);
                if (jobStr) {
                    try {
                        failedJobs.push(JSON.parse(jobStr));
                    } catch (e) {}
                }
            }
            
            const failedToKeep = failedJobs.filter(job => {
                const age = now - (job.updatedAt || job.createdAt || 0);
                return age < maxAge;
            });
            
            const failedRemoved = failedJobs.length - failedToKeep.length;
            
            if (failedRemoved > 0) {
                await redis.del('jobs:failed');
                for (const job of failedToKeep) {
                    await redis.rpush('jobs:failed', JSON.stringify(job));
                }
                console.log(`🧹 Cleaned up ${failedRemoved} old failed jobs`);
            }
        }
    } catch (err) {
        console.error('Error cleaning up old jobs:', err);
    }
}

// Run job processing every second
setInterval(processJobs, 1000);

// Run cleanup every hour
setInterval(cleanupOldJobs, 60 * 60 * 1000);

// Run cleanup once at startup
cleanupOldJobs();

console.log('🚀 Worker started and listening for jobs...');

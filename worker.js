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

// Recovery function untuk jobs yang stuck
async function recoverStuckJobs() {
    console.log('🔧 Checking for stuck jobs...');
    
    const queueLength = await redis.llen('jobs:downloader');
    const fifteenMinutesAgo = Date.now() - (15 * 60 * 1000);
    
    for (let i = 0; i < queueLength; i++) {
        const jobStr = await redis.lindex('jobs:downloader', i);
        if (!jobStr) continue;
        
        try {
            const job = JSON.parse(jobStr);
            
            // Reset jobs yang stuck processing lebih dari 15 menit
            if (job.status === 'processing' && job.updatedAt < fifteenMinutesAgo) {
                job.status = 'pending';
                job.attempt = (job.attempt || 0) + 1;
                await redis.lset('jobs:downloader', i, JSON.stringify(job));
                console.log(`⚠️ Recovered stuck job: ${job.url}`);
            }
        } catch (e) {
            console.error('Error parsing job during recovery:', e);
        }
    }
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
        await redis.lrem('jobs:downloader', 1, jobStr);
        return;
    }

    // Skip jika job sudah processing (stuck job akan di-handle oleh recovery)
    if (job.status === 'processing') {
        // Cek apakah job stuck lebih dari 5 menit
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        if (job.updatedAt && job.updatedAt < fiveMinutesAgo) {
            console.log('⚠️ Recovering stuck job...');
            job.status = 'pending';
            job.attempt = (job.attempt || 0) + 1;
            await redis.lset('jobs:downloader', 0, JSON.stringify(job));
        }
        return;
    }

    // Skip jika job bukan pending
    if (job.status !== 'pending') {
        await redis.lrem('jobs:downloader', 1, jobStr);
        return;
    }

    // Update ke processing
    job.status = 'processing';
    job.updatedAt = Date.now();
    job.attempt = job.attempt || 0;
    await redis.lset('jobs:downloader', 0, JSON.stringify(job));

    console.log('processing  \n');

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

            // Cek apakah file sudah ada
            if (checkIfFileExists(trackName, artist, folder)) {
                console.log(`✅ File sudah ada, skip download: ${trackName} - ${artist} \n`);
            } else {
                console.log(`⬇️ Downloading : ${trackName} - ${artist} \n`);
                await downloadTrack(`${trackName} ${artist}`, folder);
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

            for (let j = 0; j < tracks.length; j++) {
                const t = tracks[j];
                console.log(`Downloading (${j + 1}/${tracks.length}): ${t.name} - ${t.artist}`);
                
                try {
                    await downloadTrack(`${t.name} ${t.artist}`, folder);
                } catch (trackError) {
                    console.log(`   ❌ Failed: ${trackError.message}`);
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

            for (let j = 0; j < tracks.length; j++) {
                const t = tracks[j];
                console.log(`Downloading (${j + 1}/${tracks.length}): ${t.name} - ${t.artist}`);

                try {
                    await downloadTrack(`${t.name} ${t.artist}`, folder);
                } catch (trackError) {
                    console.log(`   ❌ Failed: ${trackError.message}`);
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

            for (let j = 0; j < tracks.length; j++) {
                const t = tracks[j];
                console.log(`Downloading (${j + 1}/${tracks.length}): ${t.name} - ${t.artist}`);

                try {
                    await downloadTrack(`${t.name} ${t.artist}`, folder);
                } catch (trackError) {
                    console.log(`   ❌ Failed: ${trackError.message}`);
                }
            }

            console.log('✅ Artist processing completed\n');

        } else {
            console.log('invalid url:', job.url);
        }

    } catch (err) {
        console.error('Error processing job:', err);

        // Check if this is the 4th attempt
        if (job.attempt >= 3) {
            // Mark as failed after 4 attempts (0, 1, 2, 3)
            job.status = 'failed';
            job.attempt = job.attempt + 1;
            job.error = err.message;
            await redis.lset('jobs:downloader', 0, JSON.stringify(job));
            
            console.log("job failed after 4 attempts \n\n");
            
            // Remove from queue dan pindahkan ke failed queue
            await redis.lrem('jobs:downloader', 1, jobStr);
            await redis.lpush('jobs:failed', JSON.stringify(job));
            return;
        } else {
            // Retry the job
            job.status = 'pending';
            job.attempt = job.attempt + 1;
            await redis.lset('jobs:downloader', 0, JSON.stringify(job));
            
            console.log("failed, will retry \n\n");
            return;
        }
    }

    // Mark as done and remove from queue
    job.status = 'done';
    job.updatedAt = Date.now();
    console.log("done \n\n");
    
    await redis.lrem('jobs:downloader', 1, jobStr);
    await redis.lpush('jobs:completed', JSON.stringify(job));
}

// Graceful shutdown function
async function gracefulShutdown(signal) {
    console.log(`\n🛑 Worker shutting down (${signal})...`);
    
    try {
        // Reset processing jobs back to pending
        const queueLength = await redis.llen('jobs:downloader');
        let resetCount = 0;
        
        for (let i = 0; i < queueLength; i++) {
            const jobStr = await redis.lindex('jobs:downloader', i);
            if (!jobStr) continue;
            
            try {
                const job = JSON.parse(jobStr);
                if (job.status === 'processing') {
                    job.status = 'pending';
                    await redis.lset('jobs:downloader', i, JSON.stringify(job));
                    resetCount++;
                }
            } catch (e) {
                console.error('Error parsing job during shutdown:', e);
            }
        }
        
        if (resetCount > 0) {
            console.log(`🔄 Reset ${resetCount} processing jobs to pending`);
        }
        
        // Close Redis connection
        await redis.quit();
        console.log('📦 Redis connection closed');
        
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

// Run recovery check every 5 minutes
setInterval(recoverStuckJobs, 5 * 60 * 1000);

// Run job processing every second
setInterval(processJobs, 1000);

console.log('🚀 Worker started and listening for jobs...');

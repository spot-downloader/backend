const express = require("express");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const { addJobs, getJobsByUrl } = require("./jobs/jobs.js");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const cors = require('cors');
const Redis = require('ioredis');

dotenv.config();

const app = express();

const port = process.env.PORT || 3000;

// Redis for SSE progress tracking
let redisAvailable = true;
const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy: (times) => {
        if (times > 3) {
            redisAvailable = false;
            console.log('❌ Redis not available, SSE progress tracking disabled');
            return null; // Stop retrying
        }
        return Math.min(times * 100, 3000);
    }
});

redis.on('error', (err) => {
    if (redisAvailable) {
        console.error('Redis connection error:', err.message);
        redisAvailable = false;
    }
});

redis.on('connect', () => {
    redisAvailable = true;
    console.log('✅ Redis connected for SSE');
});

app.use(cors({
    origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:5173'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control'],
    credentials: true
}));

app.use(bodyParser.json());

// SSE endpoint for progress tracking
app.get("/progress/:jobId", async (req, res) => {
    const { jobId } = req.params;
    
    // Set CORS headers explicitly for SSE
    const allowedOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:5173'];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
    } else {
        res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0]);
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control');
    
    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    // Check if Redis is available
    if (!redisAvailable) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'SSE not available, use polling', usePolling: true })}\n\n`);
        res.end();
        return;
    }

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', jobId })}\n\n`);

    // Keep connection alive with heartbeat
    const heartbeat = setInterval(() => {
        res.write(`: heartbeat\n\n`);
    }, 30000);

    // Subscribe to Redis channel for this job
    let subscriber;
    try {
        subscriber = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379,
            password: process.env.REDIS_PASSWORD || undefined,
            lazyConnect: true,
            connectTimeout: 5000,
        });
        
        await subscriber.connect();
    } catch (err) {
        console.error('Failed to connect subscriber:', err);
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Redis connection failed, use polling', usePolling: true })}\n\n`);
        clearInterval(heartbeat);
        res.end();
        return;
    }

    const channel = `progress:${jobId}`;
    
    subscriber.subscribe(channel, (err) => {
        if (err) {
            console.error('Failed to subscribe:', err);
            res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to subscribe', usePolling: true })}\n\n`);
            clearInterval(heartbeat);
            res.end();
        } else {
            console.log(`Subscribed to channel: ${channel}`);
        }
    });

    let isClosing = false;
    
    const cleanup = () => {
        if (isClosing) return;
        isClosing = true;
        
        clearInterval(heartbeat);
        if (subscriber && subscriber.status === 'ready') {
            subscriber.unsubscribe(channel).catch(() => {});
            subscriber.quit().catch(() => {});
        }
    };

    subscriber.on('message', (ch, message) => {
        if (ch === channel && !isClosing) {
            try {
                res.write(`data: ${message}\n\n`);
            } catch (e) {
                // Response already closed
                cleanup();
                return;
            }
            
            // Check if job is done or failed
            try {
                const data = JSON.parse(message);
                if (data.status === 'done' || data.status === 'failed') {
                    setTimeout(() => {
                        cleanup();
                        try {
                            res.end();
                        } catch (e) {}
                    }, 1000);
                }
            } catch (e) {}
        }
    });

    subscriber.on('error', (err) => {
        console.error('Redis subscriber error:', err);
        if (!isClosing) {
            try {
                res.write(`data: ${JSON.stringify({ type: 'error', message: 'Redis connection error', usePolling: true })}\n\n`);
            } catch (e) {}
        }
    });

    // Handle client disconnect
    req.on('close', () => {
        console.log(`Client disconnected from ${channel}`);
        cleanup();
    });
});


app.post("/download", async (req, res) => {
    const { url } = req.body;

    if (!url) return res.status(400).json({ error: "URL wajib diisi" });

    const job = await addJobs(url, 'pending');
    res.json({ message: "Job ditambahkan ke antrean",status:true ,job });

});

app.get("/download", async (req, res) => {
    const url = req.query.url

    if (!url) return res.status(400).json({ error: "URL wajib diisi" });

    const job = await getJobsByUrl(url);
    res.json({ message: "Job berhasil di ambil",status:true ,job });

});

app.get("/downloads/track", async (req, res) => {
    const q = decodeURIComponent(req.query.q)

    const folderPath = path.join(__dirname, "downloads/track/");

    fs.readdir(folderPath, { withFileTypes: true }, (err, entries) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Gagal membaca folder" });
        }
        
        // Filter only directories
        const directories = entries.filter(entry => entry.isDirectory());
        
        // Find the matching directory
        const matchingDir = directories.find(dir => dir.name === q);
        
        if (!matchingDir) {
            return res.status(404).json({ error: "Track tidak ditemukan" });
        }
        
        const filePath = path.join(folderPath, matchingDir.name);
        
        fs.readdir(filePath, (err, files) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: "Gagal membaca file" });
            }

            const mp3Files = files.filter(file => file.endsWith(".mp3"));
            
            if (mp3Files.length === 0) {
                return res.status(404).json({ error: "File MP3 tidak ditemukan" });
            }

            const baseNameWithoutExt = path.parse(mp3Files[0]).name;
            const fullPathFile = path.join(filePath, mp3Files[0]);
            
            // Sanitize filename untuk header HTTP
            const sanitizedFilename = baseNameWithoutExt
                .replace(/[^\w\s-]/g, '') // hapus karakter spesial
                .replace(/\s+/g, '_')     // ganti spasi dengan underscore
                .trim();
            
            res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}.zip"`);
            res.setHeader('Content-Type', 'application/zip');

            const archive = archiver('zip', { zlib: { level: 9 } });
            archive.on('error', err => {
                console.error('Archive error:', err);
                if (!res.headersSent) {
                    res.status(500).send({ error: err.message });
                }
            });

            archive.pipe(res);

            // Tambahkan file
            archive.file(fullPathFile, { name: path.basename(fullPathFile) });

            archive.finalize();
        });
    });

});

app.get("/downloads/playlist", async (req, res) => {
    const q = decodeURIComponent(req.query.q)

    const folderPath = path.join(__dirname, "downloads/playlist/");

    fs.readdir(folderPath, { withFileTypes: true }, (err, entries) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Gagal membaca folder" });
        }

        // Filter only directories
        const directories = entries.filter(entry => entry.isDirectory());
        
        // Find the matching directory
        const matchingDir = directories.find(dir => dir.name === q);
        
        if (!matchingDir) {
            return res.status(404).json({ error: "Playlist tidak ditemukan" });
        }
        
        const filePath = path.join(folderPath, matchingDir.name);
        
        fs.readdir(filePath, (err, files) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: "Gagal membaca file" });
            }

            const mp3Files = files.filter(file => file.endsWith(".mp3"));

            let data = []
            mp3Files.forEach(file => {
                let fullPathFile = path.join(filePath, file)
                data.push(fullPathFile)
            })

            // Sanitize filename untuk header HTTP
            const sanitizedFilename = q
                .replace(/[^\w\s-]/g, '')
                .replace(/\s+/g, '_')
                .trim();

            res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}.zip"`);
            res.setHeader('Content-Type', 'application/zip');

            const archive = archiver('zip', {
                zlib: { level: 9 }
            });

            archive.on('error', err => {
                console.error('Archive error:', err);
                if (!res.headersSent) {
                    res.status(500).send({ error: err.message });
                }
            });

            archive.pipe(res);

            data.forEach(filePath => {
                const fileName = path.basename(filePath);
                archive.file(filePath, { name: fileName });
            });

            archive.finalize();
        });
    });
});

app.get("/downloads/album", async (req, res) => {
    const q = decodeURIComponent(req.query.q)

    const folderPath = path.join(__dirname, "downloads/album/");

    fs.readdir(folderPath, { withFileTypes: true }, (err, entries) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Gagal membaca folder" });
        }

        // Filter only directories
        const directories = entries.filter(entry => entry.isDirectory());
        
        // Find the matching directory
        const matchingDir = directories.find(dir => dir.name === q);
        
        if (!matchingDir) {
            return res.status(404).json({ error: "Album tidak ditemukan" });
        }
        
        const filePath = path.join(folderPath, matchingDir.name);
        
        fs.readdir(filePath, (err, files) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: "Gagal membaca file" });
            }

            const mp3Files = files.filter(file => file.endsWith(".mp3"));

            let data = []
            mp3Files.forEach(file => {
                let fullPathFile = path.join(filePath, file)
                data.push(fullPathFile)
            })

            // Sanitize filename untuk header HTTP
            const sanitizedFilename = q
                .replace(/[^\w\s-]/g, '')
                .replace(/\s+/g, '_')
                .trim();

            res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}.zip"`);
            res.setHeader('Content-Type', 'application/zip');

            const archive = archiver('zip', {
                zlib: { level: 9 }
            });

            archive.on('error', err => {
                console.error('Archive error:', err);
                if (!res.headersSent) {
                    res.status(500).send({ error: err.message });
                }
            });

            archive.pipe(res);

            data.forEach(filePath => {
                const fileName = path.basename(filePath);
                archive.file(filePath, { name: fileName });
            });

            archive.finalize();
        });
    });
});

app.get("/downloads/artist", async (req, res) => {
    const q = decodeURIComponent(req.query.q)

    const folderPath = path.join(__dirname, "downloads/artist/");

    fs.readdir(folderPath, { withFileTypes: true }, (err, entries) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Gagal membaca folder" });
        }

        // Filter only directories
        const directories = entries.filter(entry => entry.isDirectory());
        
        // Find the matching directory
        const matchingDir = directories.find(dir => dir.name === q);
        
        if (!matchingDir) {
            return res.status(404).json({ error: "Artist tidak ditemukan" });
        }
        
        const filePath = path.join(folderPath, matchingDir.name);
        
        fs.readdir(filePath, (err, files) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: "Gagal membaca file" });
            }

            const mp3Files = files.filter(file => file.endsWith(".mp3"));

            let data = []
            mp3Files.forEach(file => {
                let fullPathFile = path.join(filePath, file)
                data.push(fullPathFile)
            })

            // Sanitize filename untuk header HTTP
            const sanitizedFilename = q
                .replace(/[^\w\s-]/g, '')
                .replace(/\s+/g, '_')
                .trim();

            res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}.zip"`);
            res.setHeader('Content-Type', 'application/zip');

            const archive = archiver('zip', {
                zlib: { level: 9 }
            });

            archive.on('error', err => {
                console.error('Archive error:', err);
                if (!res.headersSent) {
                    res.status(500).send({ error: err.message });
                }
            });

            archive.pipe(res);

            data.forEach(filePath => {
                const fileName = path.basename(filePath);
                archive.file(filePath, { name: fileName });
            });

            archive.finalize();
        });
    });
});

app.listen(port, () => console.log(`Server berjalan di http://localhost:${port}`));

const express = require("express");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const { addJobs, getJobsByUrl } = require("./jobs/jobs.js");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const cors = require('cors');

dotenv.config();

const app = express();

const port = process.env.PORT || 3000;

app.use(cors({
    origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:5173'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(bodyParser.json());


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

    fs.readdir(folderPath, (err, files) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Gagal membaca folder" });
        }
        
        for(let file of files){
            const filePath = path.join(__dirname, "downloads/track/",file);
            
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
                
                if(q == file){
                    const fullPathFile = filePath+'/'+mp3Files[0];
                    
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
                        res.status(500).send({ error: err.message });
                    });

                    archive.pipe(res);

                    // Tambahkan file
                    archive.file(fullPathFile, { name: path.basename(fullPathFile) });

                    archive.finalize();
                    return;
    
                }
                
            });
            
        }

    });

});

app.get("/downloads/playlist", async (req, res) => {
    const q = decodeURIComponent(req.query.q)

    const folderPath = path.join(__dirname, "downloads/playlist/");

    fs.readdir(folderPath, (err, files) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Gagal membaca folder" });
        }

        for(let file of files){
            const filePath = path.join(__dirname, "downloads/playlist/",file);
            
            if(q == file){
                fs.readdir(filePath, (err, files) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: "Gagal membaca file" });
                    }
    
                    const mp3Files = files.filter(file => file.endsWith(".mp3"));

                    let data = []
                    mp3Files.forEach(file => {
                        let fullPathFile = filePath+'/'+file
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
                        res.status(500).send({ error: err.message });
                    });

                    archive.pipe(res);

                    data.forEach(filePath => {
                        const fileName = path.basename(filePath);
                        archive.file(filePath, { name: fileName });
                    });

                    archive.finalize();
                    return;
                });
            }
        }
    });
});

app.get("/downloads/album", async (req, res) => {
    const q = decodeURIComponent(req.query.q)

    const folderPath = path.join(__dirname, "downloads/album/");

    fs.readdir(folderPath, (err, files) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Gagal membaca folder" });
        }

        for(let file of files){
            const filePath = path.join(__dirname, "downloads/album/",file);
            
            if(q == file){
                fs.readdir(filePath, (err, files) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: "Gagal membaca file" });
                    }
    
                    const mp3Files = files.filter(file => file.endsWith(".mp3"));

                    let data = []
                    mp3Files.forEach(file => {
                        let fullPathFile = filePath+'/'+file
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
                        res.status(500).send({ error: err.message });
                    });

                    archive.pipe(res);

                    data.forEach(filePath => {
                        const fileName = path.basename(filePath);
                        archive.file(filePath, { name: fileName });
                    });

                    archive.finalize();
                    return;
                });
            }
        }
    });
});

app.get("/downloads/artist", async (req, res) => {
    const q = decodeURIComponent(req.query.q)

    const folderPath = path.join(__dirname, "downloads/artist/");

    fs.readdir(folderPath, (err, files) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Gagal membaca folder" });
        }

        for(let file of files){
            const filePath = path.join(__dirname, "downloads/artist/",file);
            
            if(q == file){
                fs.readdir(filePath, (err, files) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: "Gagal membaca file" });
                    }
    
                    const mp3Files = files.filter(file => file.endsWith(".mp3"));

                    let data = []
                    mp3Files.forEach(file => {
                        let fullPathFile = filePath+'/'+file
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
                        res.status(500).send({ error: err.message });
                    });

                    archive.pipe(res);

                    data.forEach(filePath => {
                        const fileName = path.basename(filePath);
                        archive.file(filePath, { name: fileName });
                    });

                    archive.finalize();
                    return;
                });
            }
        }
    });
});

app.listen(port, () => console.log(`Server berjalan di http://localhost:${port}`));

const Redis = require('ioredis');
const crypto = require('crypto');
require('dotenv').config();

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

redis.on('error', (err) => {
    console.error('❌ Redis connection error:', err);
});

async function addJobs(url, status) {
    try {
        // Check if job already exists in queue
        const queueLength = await redis.llen('jobs:downloader');
        
        for (let i = 0; i < queueLength; i++) {
            const jobStr = await redis.lindex('jobs:downloader', i);
            if (!jobStr) continue;
            
            try {
                const existingJob = JSON.parse(jobStr);
                if (existingJob.url === url && ['pending', 'processing'].includes(existingJob.status)) {
                    return { url, id: existingJob.id, existing: true };
                }
            } catch (e) {
                console.error('Error parsing existing job:', e);
            }
        }

        // Check if job exists in completed queue
        const completedJob = await redis.lindex('jobs:completed', 0);
        if (completedJob) {
            try {
                const completed = JSON.parse(completedJob);
                if (completed.url === url) {
                    return { url, id: completed.id, status: 'done', payload: completed.payload };
                }
            } catch (e) {
                // Continue if parsing fails
            }
        }

        // Create new job
        const jobId = crypto.randomBytes(16).toString('hex');
        const job = {
            id: jobId,
            url,
            status,
            attempt: 0,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        await redis.lpush('jobs:downloader', JSON.stringify(job));
        return { url, id: jobId };

    } catch (error) {
        console.error('Error adding job:', error);
        throw error;
    }
}

async function getJobsByUrl(url) {
    try {
        // Check in completed queue first
        const completedLength = await redis.llen('jobs:completed');
        for (let i = 0; i < completedLength; i++) {
            const jobStr = await redis.lindex('jobs:completed', i);
            if (!jobStr) continue;
            
            try {
                const job = JSON.parse(jobStr);
                if (job.url === url) {
                    return [job];
                }
            } catch (e) {
                console.error('Error parsing completed job:', e);
            }
        }

        // Check in active queue
        const queueLength = await redis.llen('jobs:downloader');
        for (let i = 0; i < queueLength; i++) {
            const jobStr = await redis.lindex('jobs:downloader', i);
            if (!jobStr) continue;
            
            try {
                const job = JSON.parse(jobStr);
                if (job.url === url) {
                    return [job];
                }
            } catch (e) {
                console.error('Error parsing job:', e);
            }
        }

        return [];
    } catch (error) {
        console.error('Error getting jobs:', error);
        return [];
    }
}

module.exports = {
    addJobs,
    getJobsByUrl
};

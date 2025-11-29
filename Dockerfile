
FROM node:20-alpine

# Install system dependencies required for yt-dlp
RUN apk add --no-cache \
    python3 \
    py3-pip \
    curl \
    ffmpeg \
    && pip3 install --break-system-packages yt-dlp==2025.11.12

# Verify yt-dlp installation
RUN yt-dlp --version && which yt-dlp

# Set working directory
WORKDIR /app

# Set yt-dlp path for youtube-dl-exec
ENV YOUTUBE_DL_PATH=/usr/local/bin/yt-dlp

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
# Skip youtube-dl-exec postinstall since we install yt-dlp via pip
RUN npm ci --omit=dev --ignore-scripts

# Copy application code
COPY . .

# Create downloads directory
RUN mkdir -p downloads/playlist downloads/track downloads/album downloads/artist

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Change ownership of the app directory to the nodejs user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3081

# Start the application
CMD ["npm", "start"]

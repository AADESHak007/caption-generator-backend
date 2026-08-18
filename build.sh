#!/usr/bin/env bash
# exit on error
set -o errexit

# 1. Install dependencies & build TypeScript project
npm install
npm run build

# 2. Define local storage directory for static binaries
STORAGE_DIR=/opt/render/project/src/.bin
mkdir -p "$STORAGE_DIR"

# 3. Download and extract static FFmpeg binary if not present
cd "$STORAGE_DIR"
if [ ! -f "ffmpeg" ]; then
  echo "[Build] Downloading static FFmpeg binary from johnvansickle.com..."
  curl -O https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
  tar -xf ffmpeg-release-amd64-static.tar.xz --strip-components=1
  rm -f ffmpeg-release-amd64-static.tar.xz
  chmod +x "$STORAGE_DIR/ffmpeg"
  echo "[Build] FFmpeg binary installed and executable permissions set at $STORAGE_DIR"
fi

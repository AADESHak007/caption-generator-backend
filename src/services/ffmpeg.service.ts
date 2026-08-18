import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';

// Check for custom static FFmpeg binary (e.g. Render hosted environment)
const RENDER_FFMPEG_PATH = '/opt/render/project/src/.bin/ffmpeg';
if (fs.existsSync(RENDER_FFMPEG_PATH)) {
  ffmpeg.setFfmpegPath(RENDER_FFMPEG_PATH);
}

class FfmpegService {
  /**
   * Normalizes an input video to standard H.264 / AAC 1080p 30fps format in temp/ before processing.
   */
  public static normalizeVideo(inputVideoPath: string, outputNormalizedPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const outputDir = path.dirname(outputNormalizedPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      ffmpeg(inputVideoPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .size('1920x1080')
        .aspect('16:9')
        .autopad()
        .fps(30)
        .audioFrequency(44100)
        .audioChannels(2)
        .output(outputNormalizedPath)
        .on('end', () => resolve(outputNormalizedPath))
        .on('error', (err) => reject(err))
        .run();
    });
  }
  /**
   * Extract 16kHz mono WAV audio stream from input video for Whisper processing.
   */
  public static extractWavAudio(inputVideoPath: string, outputWavPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const outputDir = path.dirname(outputWavPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      ffmpeg(inputVideoPath)
        .noVideo()
        .audioChannels(1)
        .audioFrequency(16000)
        .audioCodec('pcm_s16le')
        .output(outputWavPath)
        .on('end', () => resolve(outputWavPath))
        .on('error', (err) => reject(err))
        .run();
    });
  }

  /**
   * Extract audio stream from input video to an audio file (e.g. .mp3) in temp folder.
   */
  public static extractAudio(inputVideoPath: string, outputAudioPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const outputDir = path.dirname(outputAudioPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      ffmpeg(inputVideoPath)
        .noVideo()
        .audioCodec('libmp3lame')
        .output(outputAudioPath)
        .on('end', () => resolve(outputAudioPath))
        .on('error', (err) => reject(err))
        .run();
    });
  }

  /**
   * Extract video frames/stream or split video into temp folder.
   */
  public static extractFrames(inputVideoPath: string, outputFramesDir: string, fps = 1): Promise<string[]> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(outputFramesDir)) {
        fs.mkdirSync(outputFramesDir, { recursive: true });
      }

      const outputPattern = path.join(outputFramesDir, 'frame-%04d.jpg');

      ffmpeg(inputVideoPath)
        .outputOptions([`-vf fps=${fps}`])
        .output(outputPattern)
        .on('end', () => {
          const files = fs.readdirSync(outputFramesDir)
            .filter(f => f.endsWith('.jpg'))
            .map(f => path.join(outputFramesDir, f));
          resolve(files);
        })
        .on('error', (err) => reject(err))
        .run();
    });
  }
}

export default FfmpegService;

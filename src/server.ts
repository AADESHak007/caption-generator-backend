import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import FfmpegService from './services/ffmpeg.service.js';
import AnalyzerService from './services/analyzer.service.js';
import { FileCleanup } from './utils/fileCleanup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.CLIENT_URL,
  'https://caption-generator-frontend-delta.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001'
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());

app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// Ensure required working directories exist
const UPLOADS_DIR = path.join(__dirname, '../uploads');
const TEMP_DIR = path.join(__dirname, '../temp');

[UPLOADS_DIR, TEMP_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure Multer storage for uploaded video files
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `video-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({ storage });

/**
 * POST /api/analyze-video
 * Uploads a video file, splits audio and video using FFmpeg, analyzes them for captions, and auto-cleans temporary files.
 */
app.post('/api/analyze-video', upload.single('video'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: 'No video file provided' });
    return;
  }

  const inputVideoPath = req.file.path;
  const requestId = path.parse(req.file.filename).name;

  // Temporary paths for split files under temp/
  const requestTempDir = path.join(TEMP_DIR, requestId);
  const normalizedVideoPath = path.join(requestTempDir, 'normalized-video.mp4');
  const audioOutputPath = path.join(requestTempDir, 'extracted-audio.wav');
  const framesOutputDir = path.join(requestTempDir, 'frames');
  const keepTemp = req.query.keepTemp === 'true';
  const llmProvider = ((req.body?.llm || req.query?.llm || 'gemini') as string).toLowerCase() === 'openai' ? 'openai' : 'gemini';

  try {
    // 1. Normalize raw uploaded video (resolutions, aspect ratio, frame rate)
    console.log(`[FFmpeg] Normalizing input video: ${req.file.originalname}`);
    await FfmpegService.normalizeVideo(inputVideoPath, normalizedVideoPath);

    // 2. Extract 16kHz WAV audio for Whisper & video frame feeds from normalized video into temp/
    console.log('[FFmpeg] Extracting 16kHz WAV audio and video frames from normalized video...');
    await FfmpegService.extractWavAudio(normalizedVideoPath, audioOutputPath);
    await FfmpegService.extractFrames(normalizedVideoPath, framesOutputDir, 0.5);

    // 3. Perform AI analysis to generate timestamped on-screen captions
    console.log(`[Analyzer] Processing audio & video feeds using ${llmProvider.toUpperCase()} provider...`);
    const captions = await AnalyzerService.analyzeMedia(audioOutputPath, framesOutputDir, llmProvider);

    // 3. Return results
    res.status(200).json({
      success: true,
      filename: req.file.originalname,
      llmProvider,
      keepTemp,
      captionsCount: captions.length,
      captions
    });

  } catch (error: any) {
    console.error('Error during video processing:', error);
    res.status(500).json({ error: 'Failed to process video', details: error?.message || error });
  } finally {
    if (keepTemp) {
      console.log(`[Cleanup] keepTemp flag set to true. Preserving working files in: ${requestTempDir}`);
    } else {
      console.log('[Cleanup] Removing temp split files and uploaded video');
      FileCleanup.cleanDirectory(requestTempDir);
      FileCleanup.cleanFile(inputVideoPath);
    }
  }
});

const serverPort = Number(process.env.PORT) || 3000;

app.listen(serverPort, '0.0.0.0', () => {
  console.log(`Server listening on 0.0.0.0:${serverPort}`);
});

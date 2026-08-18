# Project Guidelines & Rules

## Core Workflow Rules
- **FFmpeg Integration**: Use `fluent-ffmpeg` (with `@types/fluent-ffmpeg`) to invoke the local FFmpeg CLI binary directly without bundled binaries.
- **Video Normalization**: Normalize raw uploaded video inputs to standard format (H.264/AAC 1080p 30fps) under `temp/` before performing audio/frame extractions.
- **Media Splitting**: Split normalized video into 16kHz mono `.wav` audio for Whisper speech recognition and 0.5fps frame extracts (1 frame every 2 seconds) under `temp/` before AI processing.
- **Hybrid AI Processing & Captions**: Process `.wav` audio using local multilingual Whisper (`@xenova/transformers`, `Xenova/whisper-tiny` with `language: 'hi'` for Hindi & English STT), group word chunks into phrase segments (2-4s), and analyze video frames using `@google/genai` (Gemini 3.6 Flash) to perform OCR (`detectedText`), determine optimal `screenPosition` (`top`, `middle`, `bottom`), and generate English visual recommendations (`recommendation`) and high-impact English text overlays (`recommendedOverlayText`).
- **Cleanup**: Ensure temp files created in `temp/` during processing are auto-cleaned after completion unless `keepTemp` is explicitly requested.

## Architectural Boundaries
- Keep FFmpeg processing logic separated under `src/services/ffmpeg.service.ts`.
- Keep AI analysis and caption timestamping under `src/services/analyzer.service.ts`.
- Store API key configuration in `.env` / environment variables (`GEMINI_API_KEY` or `OPENAI_API_KEY`).
- Do not mutate or overwrite raw input video files.

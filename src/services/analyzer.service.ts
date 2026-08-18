import { pipeline } from '@xenova/transformers';
import { GoogleGenAI, Type } from '@google/genai';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import pkg from 'wavefile';
const { WaveFile } = pkg;
import type { CaptionSegment } from '../types/caption.types.js';

dotenv.config();

class AnalyzerService {
  private static transcriberInstance: any = null;

  /**
   * Reads a 16kHz mono WAV file into Float32Array audio data for Node.js environments.
   */
  private static readAudioData(wavFilePath: string): Float32Array {
    const buffer = fs.readFileSync(wavFilePath);
    const wav = new WaveFile(buffer);
    wav.toBitDepth('32f');
    wav.toSampleRate(16000);

    let samples = wav.getSamples(false);
    if (Array.isArray(samples)) {
      samples = samples[0];
    }
    return new Float32Array(samples as any);
  }

  /**
   * Lazy load local Whisper pipeline using @xenova/transformers (Multilingual model for English & Hindi)
   */
  private static async getTranscriber() {
    if (!this.transcriberInstance) {
      console.log('[Whisper] Initializing local Whisper STT model (Xenova/whisper-tiny)...');
      try {
        this.transcriberInstance = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny');
        console.log('[Whisper] Model loaded successfully.');
      } catch (err: any) {
        console.error('[Whisper] Model initialization failed:', err);
        throw new Error(`Whisper STT Model is currently unavailable: ${err?.message || err}`);
      }
    }
    return this.transcriberInstance;
  }

  /**
   * Transcribes audio locally using Whisper and determines screenPosition visually using Gemini.
   */
  public static async analyzeMedia(audioPath: string, framesDir: string): Promise<CaptionSegment[]> {
    console.log(`[Whisper] Transcribing audio file locally: ${audioPath}`);

    let transcriber: any;
    try {
      transcriber = await this.getTranscriber();
    } catch (err: any) {
      throw new Error(`Speech Recognition Model (Whisper) is currently unavailable: ${err?.message || err}`);
    }

    // 1. Read WAV into Float32Array for Node compatibility
    const audioData = this.readAudioData(audioPath);

    // 2. Run local speech recognition with timestamps
    let output: any;
    try {
      output = await transcriber(audioData, {
        return_timestamps: 'word',
        chunk_length_s: 30,
        stride_length_s: 5,
        language: 'hi', // supports Hindi & English speech recognition
        task: 'transcribe',
      });
    } catch (err: any) {
      throw new Error(`Speech Recognition Model failed during processing: ${err?.message || err}`);
    }

    const rawChunks = output?.chunks || [];
    let segments: CaptionSegment[] = [];

    if (rawChunks.length > 0) {
      let currentSegment: CaptionSegment | null = null;

      for (const chunk of rawChunks) {
        const [start, end] = chunk.timestamp;
        const sTime = Number((start ?? 0).toFixed(2));
        const eTime = Number((end ?? (sTime + 1.5)).toFixed(2));
        const wordText = chunk.text.trim();

        if (!currentSegment) {
          currentSegment = {
            startTime: sTime,
            endTime: eTime,
            text: wordText,
            screenPosition: 'bottom'
          };
        } else if (eTime - currentSegment.startTime < 3.5 && currentSegment.text.length < 50) {
          currentSegment.endTime = eTime;
          currentSegment.text += ` ${wordText}`;
        } else {
          segments.push(currentSegment);
          currentSegment = {
            startTime: sTime,
            endTime: eTime,
            text: wordText,
            screenPosition: 'bottom'
          };
        }
      }
      if (currentSegment) {
        segments.push(currentSegment);
      }
    } else if (output?.text) {
      segments = [
        {
          startTime: 0,
          endTime: 5,
          text: output.text.trim(),
          screenPosition: 'bottom'
        }
      ];
    }

    if (segments.length === 0) {
      console.log('[Whisper] No speech detected in audio file.');
      return [];
    }

    // 3. Perform Visual Position Analysis via Gemini
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
      throw new Error('AI Model is unavailable: GEMINI_API_KEY is not configured.');
    }

    try {
      console.log('[Gemini AI] Analyzing visual screen positions for captions...');
      segments = await this.enhancePositionsWithGemini(apiKey, segments, framesDir);
    } catch (geminiErr: any) {
      console.error('[Gemini AI] Model error:', geminiErr?.message || geminiErr);
      throw new Error(`The AI Model is currently unavailable at this time. Please try again later.`);
    }

    return segments;
  }

  /**
   * Calls Google Gemini to determine optimal screen position for each caption line based on frame context.
   */
  private static async enhancePositionsWithGemini(
    apiKey: string,
    segments: CaptionSegment[],
    framesDir: string
  ): Promise<CaptionSegment[]> {
    const ai = new GoogleGenAI({ apiKey });

    const frameFiles = fs.existsSync(framesDir)
      ? fs.readdirSync(framesDir).filter(f => f.endsWith('.jpg')).sort()
      : [];

    if (frameFiles.length === 0) {
      return segments;
    }

    const sampledFrames = frameFiles.filter((_, idx) => idx % Math.ceil(frameFiles.length / 5) === 0).slice(0, 5);
    const contents: any[] = [];

    for (const frameFile of sampledFrames) {
      const framePath = path.join(framesDir, frameFile);
      const fileBuffer = fs.readFileSync(framePath);
      contents.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: fileBuffer.toString('base64')
        }
      });
    }

    const promptText = `
You are an expert video editor, content strategist, and visual caption designer.

Execute the following analysis pipeline step-by-step:

Step 1: Inspect the provided spoken audio transcription segments:
${JSON.stringify(segments, null, 2)}

Step 2: Read and detect any pre-existing on-screen text ("detectedText") visible in the provided video frames for each timeframe.

Step 3: Synthesize the spoken audio transcription (Step 1) AND on-screen text (Step 2) with the video subject layout to output:
- "detectedText": Any text visible on screen in that frame/segment (or "" if none).
- "recommendedOverlayText": High-impact, catchy English text overlay/caption (e.g. short headline, keyword hook, translation summary, or callout) that the user SHOULD ADD visually to this frame to maximize engagement.
- "screenPosition": Optimal placement ('top', 'middle', or 'bottom') so text overlays do not cover faces, key visual subjects, or existing on-screen graphics.
- "recommendation": Actionable design/editing advice IN ENGLISH per frame (font choices, styling, contrast, animation cues, and layout rationale).

Return a JSON array containing objects corresponding to each segment.
`;

    contents.push({ text: promptText });

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.7-flash',
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              startTime: { type: Type.NUMBER },
              endTime: { type: Type.NUMBER },
              text: { type: Type.STRING },
              detectedText: { type: Type.STRING },
              recommendedOverlayText: { type: Type.STRING },
              recommendation: { type: Type.STRING },
              screenPosition: { type: Type.STRING, enum: ['top', 'middle', 'bottom'] }
            },
            required: ['startTime', 'endTime', 'text', 'recommendedOverlayText', 'screenPosition', 'recommendation']
          }
        }
      }
    });

    if (response.text) {
      try {
        const updated = JSON.parse(response.text);
        if (Array.isArray(updated)) {
          return segments.map((seg, i) => {
            const item = updated[i] || {};
            return {
              ...seg,
              detectedText: item.detectedText || '',
              recommendedOverlayText: item.recommendedOverlayText || seg.recommendedOverlayText || seg.text,
              recommendation: item.recommendation || '',
              screenPosition: (['top', 'middle', 'bottom'].includes(item.screenPosition) ? item.screenPosition : seg.screenPosition || 'bottom') as any
            };
          });
        }
      } catch (parseErr) {
        console.error('[Gemini AI] Response JSON parsing failed:', parseErr);
      }
    }

    throw new Error('AI Model (Gemini Flash) returned an unparseable response format.');
  }
}

export default AnalyzerService;
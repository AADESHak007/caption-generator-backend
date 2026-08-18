export interface CaptionSegment {
  startTime: number; // in seconds
  endTime: number;   // in seconds
  text: string;      // Spoken speech / transcription
  detectedText?: string; // Text detected visually in video frame
  recommendedOverlayText?: string; // High-impact English text overlay/caption recommended to ADD to this frame
  recommendation?: string; // AI layout, styling, and positioning recommendations in English
  screenPosition: 'top' | 'middle' | 'bottom';
}

export interface AnalysisResult {
  videoId: string;
  duration: number;
  captions: CaptionSegment[];
}


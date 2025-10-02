export interface AnalysisSentence {
  original: string;
  simplified: string;
  explanation: string[];
}

export interface AnalysisResult {
  sentences: AnalysisSentence[];
}

export interface AuthorBackgroundResult {
  biography: string;
  keyEvents: string[];
  historicalContext: string[];
}

export interface ImageAsset {
  id: string;
  title: string;
  prompt: string;
  base64Data: string;
  mimeType: string;
  token?: string;
}

export type GenerationType =
  | 'analysis'
  | 'history'
  | 'scene-images'
  | 'image-prompts';

export interface HistoricalContextResult {
  overview: string;
  recentEvents: string[];
}

export interface ImagePrompt {
  title: string;
  prompt: string;
}

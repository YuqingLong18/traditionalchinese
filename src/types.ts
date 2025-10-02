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
}

export type GenerationType =
  | 'analysis'
  | 'author'
  | 'story-images'
  | 'scene-images'
  | 'image-prompts';

export interface ImagePrompt {
  title: string;
  prompt: string;
}

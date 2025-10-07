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
  | 'image-prompts'
  | 'passage-fill'
  | 'comparative-analysis'
  | 'author-chat'
  | 'spacetime-hints';

export interface HistoricalContextResult {
  overview: string;
  recentEvents: string[];
}

export interface ImagePrompt {
  title: string;
  prompt: string;
}

export interface PassageFetchResult {
  passage: string;
}

export interface TimelineEntry {
  year: string;
  detail: string;
}

export interface ComparatorFigure {
  name: string;
  hallmarkWorks: string[];
  rationale: string;
}

export interface ComparatorRegion {
  region: string;
  figures: ComparatorFigure[];
}

export interface ComparisonMatrixRow {
  figure: string;
  region: string;
  keyWorks: string;
  formGenre: string;
  styleTechnique: string;
  themes: string;
  context: string;
  influence: string;
}

export interface ComparativeAnalysisResult {
  executiveSnapshot: string;
  timelineAnchors: TimelineEntry[];
  comparatorShortlist: ComparatorRegion[];
  comparisonMatrix: ComparisonMatrixRow[];
}

export interface SpacetimeSuggestionResult {
  subjectType: string;
  focalName: string;
  focalYears: string;
  focalCivilization: string;
  focalWork: string;
  workDate: string;
  timeWindow: string;
  civilizations: string;
  maxPerRegion: string;
  audience: string;
  length: string;
}

export type AuthorChatRole = 'user' | 'author';

export interface AuthorChatMessage {
  id: string;
  role: AuthorChatRole;
  content: string;
  timestamp: number;
}

export interface AuthorChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

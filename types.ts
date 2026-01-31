
export interface Highlight {
  timestampSeconds: number;
  displayTime: string;
  description: string;
  scoreType: string;
  intensity: 'High' | 'Medium' | 'Low';
  playerJerseyNumber?: string;
  clipUrl?: string; 
  clipBlob?: Blob; // Store the raw blob for DB saving
}

export interface GalleryItem extends Highlight {
  id: string; // Unique ID (e.g., videoId + timestamp)
  sourceFileName: string;
  savedAt: number;
}

export interface AnalysisResult {
  highlights: Highlight[];
  summary: string;
  videoId?: string; 
}

export interface HistoryItem {
  id: string;
  fileName: string;
  timestamp: number;
  result: AnalysisResult;
}

export enum AnalysisStatus {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  ANALYZING = 'ANALYZING',
  CLIPPING = 'CLIPPING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

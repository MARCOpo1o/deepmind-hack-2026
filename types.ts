
export interface Highlight {
  timestampSeconds: number;
  displayTime: string;
  description: string;
  scoreType: string;
  intensity: 'High' | 'Medium' | 'Low';
  playerJerseyNumber?: string;
  clipUrl?: string; 
}

export interface AnalysisResult {
  highlights: Highlight[];
  summary: string;
  videoId?: string; // Cache key
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

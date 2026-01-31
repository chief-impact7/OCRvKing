export interface ScoreItem {
  q_num: number;
  score: number;
  student_answer: string;
  reason: string;
}

export interface GradingResult {
  student_name: string;
  student_class?: string;
  scores: ScoreItem[];
  total_score: number;
  feedback: string;
  hasOCRIssues?: boolean;
}

export interface StudentSubmission {
  id: string;
  files: File[]; // Changed from single File to array of Files to support multi-page exams
  status: 'pending' | 'processing' | 'completed' | 'error';
  result?: GradingResult;
  errorMsg?: string;
}

export enum AppStep {
  SETUP = 1,
  UPLOAD_STUDENTS = 2,
  GRADING = 3,
}

export type GradingModel = 'gemini-3-flash-preview' | 'gemini-3-pro-preview';

export interface FileData {
  inlineData: {
    data: string;
    mimeType: string;
  };
}
export type Level = "beginner" | "intermediate" | "advanced";
export type StudyTime = "30min" | "1h" | "2h";
export type LearningStyle = "practical" | "videos" | "exercises" | "reading";

export interface LearningProfile {
  goal: string;
  level: Level;
  study_time: StudyTime;
  learning_style: LearningStyle;
}

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id?: string;
  session_id?: string;
  role: ChatRole;
  content: string;
  created_at?: string;
}

export interface RetrievedChunk {
  id: string;
  document_id: string;
  content: string;
  similarity: number;
}

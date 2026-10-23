export interface ToolCallData {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
  status: 'running' | 'completed' | 'error';
  result?: string;
}

export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoningContent?: string;
  toolCalls?: ToolCallData[];
  timestamp: number;
}

export interface FormProgress {
  filled: number;
  total: number;
}

export interface FormField {
  name: string;
  type: string;
  description?: string;
  value?: string;
  options?: string[];
}

export interface FormFieldsResponse {
  error: boolean;
  message?: string;
  total_fields: number;
  filled_fields: number;
  fields: FormField[];
}

export interface FormFillResponse {
  error?: boolean;
  status: string;
  message?: string;
  total_fields: number;
  filled_fields: number;
  active_page?: number;
  written_values?: Record<string, unknown>;
}

export interface DocumentUploadResponse {
  status: string;
  message: string;
  filename: string;
  thread_id: string;
  local_path: string;
  fields_summary: {
    error: boolean;
    total_fields: number;
    filled_fields?: number;
    fields: FormField[];
  };
}

export interface SSEEventChunk {
  event: 'thought' | 'token' | 'tool_start' | 'tool_end' | 'telemetry' | 'error';
  data: string | { id?: string; name?: string; args?: Record<string, unknown>; tool_call_id?: string; content?: string; type?: string; thread_id?: string; timestamp?: string };
}

export interface ModelInfo {
  name: string;
  display_name: string;
  size: number;
  parameter_size?: string;
  family?: string;
  is_current?: boolean;
}

export interface ModelsResponse {
  status: string;
  current_default: string;
  models: ModelInfo[];
}

export type ThemeMode = 'live' | 'paper' | 'contrast';
export type TextScale = '100' | '125' | '150';

export interface STTHealthResponse {
  status: 'online' | 'offline';
  online: boolean;
  host: string;
  port: number;
}

export interface TTSHealthResponse {
  status: 'online' | 'offline';
  online: boolean;
  host: string;
  port: number;
}

export const ALLOWED_TTS_VOICES = [
  'ger_klara_calm_female',
  'ger_uwe_newsreader_male',
  'ger_jonas_casual_male',
] as const;

export type TTSVoice = (typeof ALLOWED_TTS_VOICES)[number];

export const DEFAULT_TTS_VOICE: TTSVoice = 'ger_klara_calm_female';

export const TTS_VOICE_CONFIG: Record<TTSVoice, { label: string; previewText: string }> = {
  ger_klara_calm_female: {
    label: 'Klara (Ruhig)',
    previewText: 'Hallo, ich bin Klara.',
  },
  ger_uwe_newsreader_male: {
    label: 'Uwe (Nachrichten)',
    previewText: 'Guten Tag, ich bin Uwe.',
  },
  ger_jonas_casual_male: {
    label: 'Jonas (Lässig)',
    previewText: 'Hi, ich bin Jonas.',
  },
};

export interface TTSChunkMessage {
  data: string; // Base64 encoded 16-bit signed PCM
  sample_rate: number; // 24000
  chunk: number;
  done: boolean;
  error?: string;
}

export interface UseTTSStreamOptions {
  wsUrl?: string;
  defaultVoice?: TTSVoice;
  enabled?: boolean;
  onError?: (error: Error) => void;
  onPlaybackEnd?: (messageId: string) => void;
}

export interface UseTTSStreamReturn {
  isPlaying: boolean;
  activeMessageId: string | null;
  error: string | null;
  speak: (messageId: string, text: string, voice?: string) => Promise<void>;
  stop: () => void;
}

export interface UserProfileResponse {
  exists: boolean;
  content: string;
  updated_at?: string | null;
}

export interface UserProfileSaveResponse {
  status: string;
  updated_at: string;
}

export interface UserProfileDeleteResponse {
  status: string;
  message?: string;
}




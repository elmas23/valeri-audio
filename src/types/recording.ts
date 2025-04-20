export interface RecordingStatusRequest {
    RecordingUrl: string;
    RecordingSid: string;
    CallSid: string;
    RecordingDuration: string;
    RecordingStatus: string;
  }
  
  export interface TranscriptionRequest {
    RecordingSid: string;
    TranscriptionText: string;
  }
  
  export interface RecordingMetadata {
    recording_sid: string;
    call_sid: string;
    duration: number;
    audio_url?: string; // URL to the audio stored in Supabase Storage
    transcript_url?: string; // URL to the transcript stored in Supabase Storage
    audio_summary?: string;
  }
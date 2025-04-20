import { RecordingMetadata } from '../types/recording';
import supabase from '../config/supabase';


export const storeRecording = async (recording: Buffer, metadata: RecordingMetadata) => {
  try {
    // Upload file to Supabase Storage
    const fileName = `${metadata.recording_sid}.mp3`;
    const bucketName = 'recordings';
    
    // Upload the recording to Supabase Storage
    const { data: fileData, error: uploadError } = await supabase
      .storage
      .from(bucketName)
      .upload(fileName, recording, {
        contentType: 'audio/mpeg',
        cacheControl: '3600'
      });
    
    if (uploadError) {
      throw new Error(`Failed to upload recording: ${uploadError.message}`);
    }
    
    // Get public URL for the file
    const { data: urlData } = supabase
      .storage
      .from(bucketName)
      .getPublicUrl(fileName);
      
    const audio_url = urlData.publicUrl;
    
    // Store metadata in Supabase PostgreSQL
    const { data: metadataData, error: metadataError } = await supabase
      .from('recordings')
      .insert({
        recording_sid: metadata.recording_sid,
        call_sid: metadata.call_sid,
        duration: metadata.duration,
        audio_summary: metadata.audio_summary || null, // Store audio summary
        audio_url: audio_url,
        transcript_url: metadata.transcript_url || null,
        created_at: new Date().toISOString()
      });
    
    if (metadataError) {
      throw new Error(`Failed to store metadata: ${metadataError.message}`);
    }
    
    return audio_url;
  } catch (error) {
    console.error(`[ERROR] Failed to store recording: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
};


export const storeTranscriptionAndSummary = async (
  recordingSid: string,
  transcription: string,
  summary: string
) => {
  try {
    // Create file name for the transcript
    const fileName = `${recordingSid}_transcript.txt`;
    const bucketName = 'recordings'; // Use the same bucket as recordings
    
    // Upload the transcript to Supabase Storage
    const { data: fileData, error: uploadError } = await supabase
      .storage
      .from(bucketName)
      .upload(fileName, Buffer.from(transcription), {
        contentType: 'text/plain',
        cacheControl: '3600'
      });
    
    if (uploadError) {
      throw new Error(`Failed to upload transcript: ${uploadError.message}`);
    }
    
    // Get public URL for the transcript file
    const { data: urlData } = supabase
      .storage
      .from(bucketName)
      .getPublicUrl(fileName);
      
    const transcript_url = urlData.publicUrl;
    
    // Update recordings table with transcript_url and audio_summary
    const { error: updateError } = await supabase
      .from('recordings')
      .update({
        transcript_url,
        audio_summary: summary,
      })
      .eq('recording_sid', recordingSid);
    
    if (updateError) {
      throw new Error(`Failed to update recording with transcript: ${updateError.message}`);
    }
    
    return { transcript_url, summary };
  } catch (error) {
    console.error(`[ERROR] Failed to store transcript: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
};

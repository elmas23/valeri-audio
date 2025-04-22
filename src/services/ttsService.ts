import openai from '../config/openai';
import logger from '../utils/logger';
import supabase from '../config/supabase';
import { Buffer } from 'buffer';

/**
 * Generate human-like speech from text using OpenAI's TTS API
 */
export const generateSpeech = async (
  text: string, 
  recordingSid: string
): Promise<string> => {
  try {
    logger.info('Generating speech with OpenAI TTS');
    
    // Generate audio with OpenAI
    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova", // Most natural sounding voice
      input: text,
    });
    
    // Convert to buffer
    const audioBuffer = Buffer.from(await response.arrayBuffer());
    logger.info(`Generated speech audio: ${audioBuffer.byteLength} bytes`);
    
    // Save the audio file to Supabase
    const fileName = `${recordingSid}_summary_speech.mp3`;
    const bucketName = 'recordings';
    
    const { data: fileData, error: uploadError } = await supabase
      .storage
      .from(bucketName)
      .upload(fileName, audioBuffer, {
        contentType: 'audio/mpeg',
        cacheControl: '3600'
      });
    
    if (uploadError) {
      throw new Error(`Failed to upload speech: ${uploadError.message}`);
    }
    
    // Get public URL
    const { data: urlData } = supabase
      .storage
      .from(bucketName)
      .getPublicUrl(fileName);
    
    const speechUrl = urlData.publicUrl;
    logger.info(`Speech URL: ${speechUrl}`);
    
    return speechUrl;
  } catch (error) {
    logger.error('Error generating speech:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
};

import fetch from 'node-fetch';
import env from '../config/env';
import logger from '../utils/logger';
import { storeRecording, storeTranscriptionAndSummary } from './storageService';
import recordingProcessorService from './recordingProcessorService';
import twilio from 'twilio';
import { generateSpeech } from './ttsService';

export const processRecording = async (
  recordingSid: string,
  callSid: string,
  recordingUrl: string,
  duration: string
): Promise<void> => {
  try {
    logger.info(`Downloading recording from: ${recordingUrl}.mp3`);
    
    // Download the recording with Twilio authentication
    const recordingResponse = await fetch(`${recordingUrl}.mp3`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${env.twilio.accountSid}:${env.twilio.authToken}`).toString('base64')}`
      }
    });
    
    if (!recordingResponse.ok) {
      throw new Error(`Failed to download recording: ${recordingResponse.status} ${recordingResponse.statusText}`);
    }
    
    const recordingBuffer = await recordingResponse.arrayBuffer();
    logger.info(`Downloaded recording: ${recordingBuffer.byteLength} bytes`);
    
    const audioBuffer = Buffer.from(recordingBuffer);
    
    // Run storage and transcription in parallel
    const [storageResult, processingResult] = await Promise.all([
      // Store recording in Supabase
      storeRecording(
        audioBuffer,  
        {
          recording_sid: recordingSid,
          call_sid: callSid,
          duration: parseInt(duration),
          audio_url: recordingUrl,
          transcript_url: '',
          audio_summary: ''
        }
      ),
      
      // Process recording to get transcription and summary
      recordingProcessorService.processRecording(audioBuffer)
    ]);
    
    // After both complete, store the transcription and summary
    await storeTranscriptionAndSummary(
      recordingSid,
      processingResult.transcription,
      processingResult.summary
    );

    // Log the summary in a nicely formatted box
    logger.info(`\n${'='.repeat(80)}\n📝 CALL SUMMARY:\n${'='.repeat(80)}\n${processingResult.summary}\n${'='.repeat(80)}`);
    
    // Get caller info from Twilio
    const twilioClient = twilio(env.twilio.accountSid, env.twilio.authToken);
    const call = await twilioClient.calls(callSid).fetch();
    const callerNumber = call.from;
    
    // Send SMS with the summary to the caller
    if (callerNumber) {
        try {
          logger.info(`Initiating call to ${callerNumber} to read summary`);
          
          // Generate human-like speech for the summary
          const summaryText = `Hello, here is a summary of your recent call. ${processingResult.summary} Thank you for using our service. Goodbye.`;
          const speechUrl = await generateSpeech(summaryText, recordingSid);
          
          // Call the user back with the speech audio
          await twilioClient.calls.create({
            to: callerNumber,
            from: env.twilio.phoneNumber,
            twiml: `<Response>
                      <Play>${speechUrl}</Play>
                    </Response>`
          });
          
          logger.info(`Initiated call to ${callerNumber} with audio summary`);
        } catch (speechError) {
          logger.error('Error generating or playing speech:', speechError instanceof Error ? speechError.message : 'Unknown error');
        }
      }
    
    logger.info(`Recording ${recordingSid} processed successfully`);
  } catch (error) {
    logger.error('Error processing recording:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
};
import { Request, Response } from 'express';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse';
import { RecordingStatusRequest } from '../types/recording';
import { processRecording } from '../services/recordingService';
import logger from '../utils/logger';

export const generateRecordingTwiml = (req: Request, res: Response): void => {
  const twiml = new VoiceResponse();
  twiml.say('This call is being recorded for training purposes.');
  twiml.record({
    timeout: 30,
    maxLength: 300, // 5 minutes
    recordingStatusCallback: '/recording-status',
    recordingStatusCallbackEvent: ['completed'],
  });
  res.type('text/xml').send(twiml.toString());
};

export const handleRecordingStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    logger.info('Received recording status callback');
    
    const {
      RecordingUrl,
      RecordingSid,
      CallSid,
      RecordingDuration,
      RecordingStatus
    } = req.body as RecordingStatusRequest;
    
    if (!RecordingUrl || !RecordingSid || !CallSid) {
      logger.error('Missing required fields in recording callback:', req.body);
      res.status(400).send('Missing required fields in request');
      return;
    }
    
    logger.info(`Recording status update: ${RecordingSid}, status: ${RecordingStatus}`);
    
    await processRecording(
      RecordingSid,
      CallSid,
      RecordingUrl,
      RecordingDuration
    );
    
    res.status(200).send('Recording status processed');
  } catch (error) {
    logger.error('Error handling recording status:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).send('Error processing recording status');
  }
};
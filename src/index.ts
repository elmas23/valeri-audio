import express, { Request, Response } from 'express';
import twilio from 'twilio';
import VoiceResponse = require("twilio/lib/twiml/VoiceResponse");
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables

// Log the current directory
console.log('Current directory:', process.cwd());

// Define the path to the .env file
const envPath = path.resolve(process.cwd(), '.env');

// Check if the file exists
console.log('Checking .env file at:', envPath);
console.log('File exists:', fs.existsSync(envPath));

// Try to load the file contents
try {
  if (fs.existsSync(envPath)) {
    const envContents = fs.readFileSync(envPath, 'utf8');
  }
} catch (error) {
  console.error('Error reading .env file:', error);
}

// Load environment variables
const result = dotenv.config({ path: envPath });

// Log the variables
console.log('TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID);
console.log('TWILIO_AUTH_TOKEN length:', process.env.TWILIO_AUTH_TOKEN ? process.env.TWILIO_AUTH_TOKEN.length : 0);

// Environment variables
const accountSid: string = process.env.TWILIO_ACCOUNT_SID || '';
const authToken: string = process.env.TWILIO_AUTH_TOKEN || '';
const phoneNumber: string = process.env.TWILIO_PHONE_NUMBER || '';

// Check if credentials are loaded
if (!accountSid || !authToken) {
  console.error('ERROR: Twilio credentials not found. Make sure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are set in .env file');
}

// Initialize Twilio client
const twilioClient = twilio(accountSid, authToken);

// Types
interface RecordingStatusRequest {
  RecordingUrl: string;
  RecordingSid: string;
  CallSid: string;
  RecordingDuration: string;
  RecordingStatus: string;
}

interface TranscriptionRequest {
  RecordingSid: string;
  TranscriptionText: string;
}

// Create Express app
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Create recordings directory if it doesn't exist
const recordingsDir = path.join(__dirname, '../recordings');
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

// Record the call when the user calls the phone number
app.post('/record', (req: Request, res: Response) => {
  const twiml = new VoiceResponse();
  twiml.say('This call is being recorded for training purposes.');
  twiml.record({
    timeout: 30,
    maxLength: 3600, // 1 hour
    recordingStatusCallback: '/recording-status',
    recordingStatusCallbackEvent: ['completed'],
  });
  res.type('text/xml').send(twiml.toString());
});

// Handle the recording status callback
app.post('/recording-status', async (req: Request, res: Response) => {
  try {
    console.log('Received recording status callback with body:', JSON.stringify(req.body, null, 2));
    
    // This endpoint will only be called when recording status changes to "completed"
    // because we specified recordingStatusCallbackEvent: ['completed']
    const {
      RecordingUrl,
      RecordingSid,
      CallSid,
      RecordingDuration,
      RecordingStatus
    } = req.body as RecordingStatusRequest;
    
    if (!RecordingUrl || !RecordingSid || !CallSid) {
      console.error('Missing required fields in recording callback:', req.body);
      return res.status(400).send('Missing required fields in request');
    }
    
    console.log(`Recording status update: ${RecordingSid}, status: ${RecordingStatus}`);
    
    // Log the download attempt
    console.log(`[LOG] Downloading recording from: ${RecordingUrl}.mp3`);
    console.log(`[LOG] Using accountSid: ${accountSid.substring(0, 5)}...`);
    
    try {
      // Download the recording with proper Twilio authentication
      const recordingResponse = await fetch(`${RecordingUrl}.mp3`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`
        }
      });
      
      if (!recordingResponse.ok) {
        console.error(`[ERROR] Failed to download with status: ${recordingResponse.status} ${recordingResponse.statusText}`);
        throw new Error(`Failed to download recording: ${recordingResponse.status} ${recordingResponse.statusText}`);
      }
      
      const recordingBuffer = await recordingResponse.arrayBuffer();
      console.log(`[LOG] Downloaded recording: ${recordingBuffer.byteLength} bytes`);
      
      // Save recording to local file
      await saveRecordingToFile(
        RecordingSid,
        CallSid,
        new Uint8Array(recordingBuffer),
        RecordingDuration
      );
      
      console.log(`Recording ${RecordingSid} processed successfully`);
      res.status(200).send('Recording status processed');
    } catch (downloadError) {
      console.error('Error downloading recording:', downloadError instanceof Error ? downloadError.message : downloadError);
      res.status(500).send(`Error downloading recording: ${downloadError instanceof Error ? downloadError.message : downloadError}`);
    }
  } catch (error) {
    console.error('Error processing recording status:', error instanceof Error ? error.message : error);
    res.status(500).send('Error processing recording status');
  }
});

// Function to save recording to local file system
async function saveRecordingToFile(
  recordingSid: string,
  callSid: string,
  fileBuffer: Uint8Array,
  duration: string
): Promise<{
  filePath: string;
  metadata: any;
}> {
  try {
    // Create filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${callSid}_${timestamp}.mp3`;
    const filePath = path.join(recordingsDir, fileName);
    
    // Write file to disk
    //fs.writeFileSync(filePath, fileBuffer);
    
    console.log(`[LOG] Saved recording to file: ${filePath}`);
    console.log(`[LOG] Recording details:`);
    console.log(`[LOG]   - recording_sid: ${recordingSid}`);
    console.log(`[LOG]   - call_sid: ${callSid}`);
    console.log(`[LOG]   - duration: ${parseInt(duration || '0', 10)} seconds`);
    console.log(`[LOG]   - file_path: ${filePath}`);
    console.log(`[LOG]   - created_at: ${timestamp}`);
    
    // Save metadata to JSON file for record keeping
    const metadata = {
      recording_sid: recordingSid,
      call_sid: callSid,
      duration: parseInt(duration || '0', 10),
      file_path: filePath,
      created_at: timestamp
    };
    
    const metadataPath = path.join(recordingsDir, `${recordingSid}_metadata.json`);
    //fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    
    return { 
      filePath, 
      metadata 
    };
  } catch (error) {
    console.error('Error saving recording to file:', error instanceof Error ? error.message : error);
    throw error;
  }
}

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log(`Recording webhook available at http://localhost:${port}/record`);
});
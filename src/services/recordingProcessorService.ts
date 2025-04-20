import openai from '../config/openai';
import { toFile } from 'openai/uploads';
import { Buffer } from 'buffer';
import logger from '../utils/logger';
import axios from 'axios';
import FormData from 'form-data';

const prompt = `
Please analyze this phone call transcription and provide a concise summary with the following components:

Hi there! I've analyzed your recent call and prepared a quick summary for you:

First, here's what the call was mainly about:
[OVERVIEW - 1-2 conversational sentences about the main purpose and outcome]

I noticed these people were part of the conversation:
[KEY PARTICIPANTS - Casual mention of speakers and their roles]

The most important points that came up were:
- [POINT 1]
- [POINT 2]
- [POINT 3]
(And maybe 1-2 more if they were truly important)

Let me highlight what needs follow-up:
[ACTION ITEMS - Conversational description of who needs to do what and when]

Something worth remembering - during the call, someone said:
"[NOTABLE QUOTE]"

Overall, the conversation felt [SENTIMENT - casual description like "pretty friendly" or "a bit tense"]

For next steps:
[NEXT STEPS - Simple description of follow-up plans]

Hope this helps! If anything seemed unclear in the recording, I've noted that you might want to double-check about [UNCLEAR POINTS].
`;

interface ProcessedRecording {
  transcription: string;
  summary: string;
}

interface ApiError extends Error {
  response?: {
    data?: {
      error?: {
        type?: string;
        code?: string;
        message?: string;
      }
    },
    status?: number;
  }
}

class RecordingProcessorService {
  /**
   * Process an audio recording to get transcription and summary
   */
  async processRecording(audioBuffer: Buffer): Promise<ProcessedRecording> {
    try {
      const transcription = await this.transcribeAudio(audioBuffer);
      const summary = await this.generateSummary(transcription);

      return {
        transcription,
        summary,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error processing recording:', errorMessage);
      
      // Provide more specific error messages based on the error type
      if (this.isQuotaError(error)) {
        throw new Error('OpenAI API quota exceeded. Please check your billing details or try again later.');
      }
      
      throw error;
    }
  }

  /**
   * Check if the error is related to quota/billing issues
   */
  private isQuotaError(error: unknown): boolean {
    const apiError = error as ApiError;
    
    // Check for quota error in OpenAI API response
    if (apiError.response?.data?.error?.code === 'insufficient_quota' || 
        apiError.response?.data?.error?.type === 'insufficient_quota') {
      return true;
    }
    
    // Check for 429 status code (rate limit or quota exceeded)
    if (apiError.response?.status === 429) {
      return true;
    }
    
    // Check error message content
    const errorMessage = apiError.message?.toLowerCase() || '';
    return errorMessage.includes('quota') || 
           errorMessage.includes('billing') || 
           errorMessage.includes('rate limit');
  }

  /**
   * Transcribe audio using OpenAI's Whisper API with axios
   */
  async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    const maxRetries = 5;
    let retryCount = 0;
    
    logger.info(`Processing audio buffer of size: ${audioBuffer.length} bytes`);
    logger.info(`File size: ${audioBuffer.length / (1024 * 1024)} MB`);
    
    while (retryCount < maxRetries) {
      try {
        // Add delay before retries with exponential backoff
        if (retryCount > 0) {
          const delayMs = Math.min(1000 * Math.pow(2, retryCount), 30000);
          logger.info(`Waiting ${delayMs}ms before attempt ${retryCount + 1}...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        
        logger.info(`Starting transcription attempt ${retryCount + 1} of ${maxRetries}`);
        
        // Create form data for the request
        const formData = new FormData();
        
        // Add the audio file to the form data
        formData.append('file', audioBuffer, {
          filename: 'audio.mp3',
          contentType: 'audio/mpeg',
        });
        
        // Add the model parameter
        formData.append('model', 'whisper-1');
        
        // Use axios for the request
        const response = await axios.post(
          'https://api.openai.com/v1/audio/transcriptions',
          formData,
          {
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              ...formData.getHeaders(),
            },
            timeout: 600000, // 10 minutes timeout
            maxContentLength: Infinity, // Allow large response sizes
            maxBodyLength: Infinity,    // Allow large request body
          }
        );
        
        logger.info('Transcription successful');
        return response.data.text;
      } catch (error) {
        const apiError = error as ApiError;
        
        logger.error('Axios error details:', {
          message: apiError.message,
          response: apiError.response?.data,
          status: apiError.response?.status,
        });
        
        // Check if this is a quota/billing error
        if (this.isQuotaError(apiError)) {
          logger.error('API quota exceeded or billing issue detected');
          throw new Error(`OpenAI API quota exceeded. Please check your billing details: ${apiError.message}`);
        }
        
        // For other errors, continue with retry logic
        retryCount++;
        
        if (retryCount >= maxRetries) {
          logger.error('All transcription attempts failed');
          throw new Error(`Transcription failed after ${maxRetries} attempts: ${apiError.message}`);
        }
      }
    }
    
    throw new Error('Failed to transcribe after maximum retries');
  }

  /**
   * Generate a summary of the transcribed text
   */
  async generateSummary(transcription: string): Promise<string> {
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        // Add delay before retries
        if (retryCount > 0) {
          const delayMs = Math.min(1000 * Math.pow(2, retryCount), 10000);
          logger.info(`Waiting ${delayMs}ms before summary attempt ${retryCount + 1}...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        
        logger.info(`Starting summary generation attempt ${retryCount + 1} of ${maxRetries}`);
        
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini-2024-07-18',
          messages: [
            { role: 'system', content: prompt },
            {
              role: 'user',
              content: `Please provide a concise summary of the following phone call transcript:\n\n${transcription}`,
            },
          ],
          max_tokens: 500,
        });

        return response.choices[0]?.message?.content || 'No summary generated';
      } catch (error) {
        const apiError = error as ApiError;
        
        logger.error('Summary generation error:', {
          message: apiError.message,
          response: apiError.response?.data,
          status: apiError.response?.status,
        });
        
        // Check if this is a quota/billing error
        if (this.isQuotaError(apiError)) {
          logger.error('API quota exceeded or billing issue detected during summary generation');
          throw new Error(`OpenAI API quota exceeded when generating summary. Please check your billing details: ${apiError.message}`);
        }
        
        // For other errors, continue with retry logic
        retryCount++;
        
        if (retryCount >= maxRetries) {
          logger.error('All summary generation attempts failed');
          return 'Error generating summary. Please try again later.';
        }
      }
    }
    
    return 'Unable to generate summary after multiple attempts';
  }

  /**
   * Check API quota status before processing
   * This can be called before expensive operations to prevent wasted processing
   */
  async checkApiQuota(): Promise<boolean> {
    try {
      // Make a minimal API call to test if the quota is available
      await openai.chat.completions.create({
        model: 'gpt-3.5-turbo', // Using a cheaper model for the check
        messages: [
          { role: 'user', content: 'Test' }
        ],
        max_tokens: 5
      });
      
      logger.info('API quota check passed');
      return true;
    } catch (error) {
      const apiError = error as ApiError;
      
      if (this.isQuotaError(apiError)) {
        logger.error('API quota check failed - insufficient quota');
        return false;
      }
      
      // If there's some other error, assume the quota is fine
      logger.info('API quota check had an error, but not quota-related:', apiError.message);
      return true;
    }
  }
}

export default new RecordingProcessorService();
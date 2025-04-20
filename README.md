
## Overview
this app that records phone calls, transcribes the audio to text, generates summaries, and call back the callers with the relevant summaries.

## Installation

1. Clone the repository:
   ```bash
   gh repo clone elmas23/valeri-audio
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```
   # Twilio Configuration
   TWILIO_ACCOUNT_SID=your_account_sid
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_PHONE_NUMBER=your_twilio_phone_number
   
   # OpenAI Configuration
   OPENAI_API_KEY=your_openai_api_key
   
   # Supabase Configuration
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_key
   
   # Server Configuration
   PORT=3000
   ```

## Usage

### Starting the Service
```bash
npx ts-node src/app.ts
```

### Making Calls
1. Call your Twilio phone number
2. The call will be recorded (max 5 minutes)
3. After the call ends:
   - The audio will be stored in Supabase
   - The recording will be transcribed using OpenAI
   - A summary will be generated
   - The app will call back the caller with a summary 

### API Endpoints

- `POST /record` - TwiML endpoint for starting a call recording
- `POST /recording-status` - Webhook for Twilio recording status updates

## Deployment

### Deploying to Vercel

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy the project:
   ```bash
   vercel
   ```

4. Configure environment variables in the Vercel dashboard

5. Update your Twilio webhook URLs to point to your Vercel deployment

## Architecture

- **Recording Controller**: Handles Twilio webhooks and TwiML generation
- **Recording Service**: Manages the recording workflow and coordinates processes
- **Recording Processor**: Handles transcription and summary generation
- **Storage Service**: Manages file storage in Supabase

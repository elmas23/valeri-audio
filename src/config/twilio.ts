import twilio from 'twilio';
import env from './env';

// Initialize Twilio client
const twilioClient = twilio(env.twilio.accountSid, env.twilio.authToken);

export default twilioClient;
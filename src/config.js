import 'dotenv/config';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function optionalEnv(name, fallback) {
  return process.env[name] || fallback;
}

export const config = Object.freeze({
  port: parseInt(optionalEnv('PORT', '5050'), 10),
  deepgram: {
    apiKey: requireEnv('DEEPGRAM_API_KEY'),
  },
  openai: {
    apiKey: requireEnv('OPENAI_API_KEY'),
  },
  elevenlabs: {
    apiKey: requireEnv('ELEVENLABS_API_KEY'),
    voiceId: requireEnv('ELEVENLABS_VOICE_ID'),
  },
  twilio: {
    accountSid: requireEnv('TWILIO_ACCOUNT_SID'),
    authToken: requireEnv('TWILIO_AUTH_TOKEN'),
    phoneNumber: requireEnv('TWILIO_PHONE_NUMBER'),
  },
  business: {
    name: optionalEnv('COMPANY_NAME', 'Rapid Restore'),
    city: optionalEnv('COMPANY_CITY', 'Philadelphia'),
  },
});

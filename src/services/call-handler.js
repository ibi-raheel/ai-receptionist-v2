import { logger } from '../utils/logger.js';
import { DeepgramASR } from './deepgram-asr.js';
import { LLMEngine } from './llm-engine.js';
import { ElevenLabsTTS } from './elevenlabs-tts.js';
import { EmotionEngine } from './emotion-engine.js';
import { ConversationFSM } from '../state/conversation-fsm.js';
import { processLeadCapture, getLead, deleteLead } from './lead-capture.js';
import { injectProsody } from './prosody-injector.js';

const activeCalls = new Map();

export async function handleCall(twilioWs) {
  let streamSid = null;
  let callSid = null;
  let sendingAudio = false;

  // Initialize all components
  const asr = new DeepgramASR();
  const tts = new ElevenLabsTTS();
  const emotionEngine = new EmotionEngine();
  const fsm = new ConversationFSM();
  const llm = new LLMEngine({ conversationFSM: fsm, emotionEngine });

  // Accumulate final transcripts between utterance_end events
  let transcriptBuffer = '';
  let cleaned = false;

  // --- TTS audio → Twilio ---
  let audioSentCount = 0;
  tts.on('audio', (base64Audio) => {
    if (!sendingAudio) {
      logger.debug('Audio chunk dropped — sendingAudio is false');
      return;
    }
    if (twilioWs.readyState !== twilioWs.OPEN) {
      logger.debug('Audio chunk dropped — Twilio WS not open');
      return;
    }
    if (!streamSid) {
      logger.debug('Audio chunk dropped — no streamSid');
      return;
    }
    audioSentCount++;
    if (audioSentCount === 1) {
      logger.info('First audio chunk sent to Twilio');
    }
    twilioWs.send(JSON.stringify({
      event: 'media',
      streamSid,
      media: { payload: base64Audio },
    }));
  });

  // --- ASR events ---
  // Trust Deepgram for turn detection. Final transcripts accumulate in the buffer.
  // We only process when Deepgram fires utterance_end (real silence detected).
  // No custom timers, no word lists — Deepgram's VAD is trained on this.

  // Track AI speech state for barge-in
  let aiFinishedSpeaking = true;

  asr.on('transcript', (text) => {
    transcriptBuffer += (transcriptBuffer ? ' ' : '') + text;
    logger.debug({ transcript: text, buffer: transcriptBuffer }, 'ASR final transcript buffered');

    // Barge-in: if AI is speaking and caller says something real, interrupt
    if (sendingAudio && !aiFinishedSpeaking) {
      sendingAudio = false;
      tts.cancel();
      llm.cancel();
      if (streamSid && twilioWs.readyState === twilioWs.OPEN) {
        twilioWs.send(JSON.stringify({ event: 'clear', streamSid }));
      }
      logger.info('Barge-in: caller spoke over AI');
    }
  });

  asr.on('utterance_end', () => {
    // Deepgram says the caller stopped talking. Process whatever we've accumulated.
    if (!transcriptBuffer) return;
    const utterance = transcriptBuffer;
    transcriptBuffer = '';
    logger.info({ utterance }, 'Processing utterance');
    processUtterance(utterance);
  });

  asr.on('speech_started', () => {
    // Just log — barge-in is handled by transcript confirmation above
    logger.debug('Speech detected');
  });

  // Track when AI finishes speaking
  tts.on('done', () => {
    aiFinishedSpeaking = true;
  });

  // --- LLM streaming → Emotion Engine → Prosody → TTS ---
  let tokenBuffer = '';
  let prefixParsed = false;
  let ttsStarted = false;

  llm.on('token', (token) => {
    tokenBuffer += token;

    // Parse all prefix tags ([EMOTION:...][STATE:...]) before sending text to TTS
    if (!prefixParsed) {
      // Wait until we have enough tokens to parse all tags
      // Tags look like: [EMOTION:calm→cheerful][STATE:PROBLEM_DISCOVERY] actual text
      // We need to find where the tags end and the speech text begins
      const stripped = stripPrefixTags(tokenBuffer);
      if (stripped === null) {
        // Still accumulating tags, wait for more tokens
        return;
      }

      prefixParsed = true;
      const { emotionTag, stateTag, text } = stripped;

      // Process emotion
      if (emotionTag) {
        emotionEngine.parseResponse(emotionTag + ' ' + (text || ''));
      }

      // Process state transition
      if (stateTag) {
        const stateMatch = stateTag.match(/\[STATE:(\w+)\]/);
        if (stateMatch) {
          fsm.transition(stateMatch[1]);
        }
      }

      // Start TTS with emotion voice settings
      if (!ttsStarted) {
        const voiceSettings = emotionEngine.getVoiceSettings();
        tts.startGeneration(voiceSettings);
        sendingAudio = true;
        aiFinishedSpeaking = false;
        ttsStarted = true;
      }

      // Send any speech text after the tags to TTS
      if (text) {
        tts.sendText(injectProsody(text));
      }
      tokenBuffer = '';
      return;
    }

    // Stream text to TTS with prosody
    tts.sendText(injectProsody(token));
  });

  llm.on('done', (fullResponse) => {
    // If prefix was never parsed (no tags), send all tokens to TTS
    if (!prefixParsed && tokenBuffer) {
      const voiceSettings = emotionEngine.getVoiceSettings();
      if (!ttsStarted) {
        tts.startGeneration(voiceSettings);
        sendingAudio = true;
        aiFinishedSpeaking = false;
        ttsStarted = true;
      }
      // Strip any tags that might be in the buffer
      const cleaned = tokenBuffer.replace(/\[EMOTION:[^\]]*\]/g, '').replace(/\[STATE:[^\]]*\]/g, '').trimStart();
      if (cleaned) {
        tts.sendText(injectProsody(cleaned));
      }
    }
    tts.flush();
    tokenBuffer = '';
    prefixParsed = false;
    ttsStarted = false;

    if (fullResponse) {
      logger.info({ responseLength: fullResponse.length }, 'LLM response complete');
    }
  });

  llm.on('function_call', async ({ id, name, arguments: args }) => {
    if (name === 'capture_lead') {
      const result = processLeadCapture(callSid || streamSid, args);
      fsm.transition('CONTACT_CAPTURE');
      await llm.addFunctionResult(id, result);
    } else {
      logger.warn({ name }, 'Unknown function call');
      await llm.addFunctionResult(id, { error: 'Unknown function' });
    }
  });

  llm.on('error', (err) => {
    logger.error({ err: err.message }, 'LLM error');
  });

  /**
   * Strip [EMOTION:...] and [STATE:...] tags from the start of LLM output.
   * Returns null if we haven't received enough tokens to determine where tags end.
   * Returns { emotionTag, stateTag, text } when we can parse.
   */
  function stripPrefixTags(buffer) {
    // Need at least one closing bracket to start parsing
    if (!buffer.includes(']')) return null;

    let remaining = buffer;
    let emotionTag = null;
    let stateTag = null;

    // Extract [EMOTION:...] tag
    const emotionMatch = remaining.match(/^\[EMOTION:[^\]]*\]/);
    if (emotionMatch) {
      emotionTag = emotionMatch[0];
      remaining = remaining.slice(emotionTag.length);
    }

    // Extract [STATE:...] tag (might need more tokens)
    if (remaining.startsWith('[STATE:') || remaining.startsWith('[')) {
      const stateClose = remaining.indexOf(']');
      if (stateClose === -1) return null; // Need more tokens
      stateTag = remaining.slice(0, stateClose + 1);
      remaining = remaining.slice(stateClose + 1);
    }

    // If we haven't found any tags but have a bracket, check if it's still forming
    if (!emotionTag && !stateTag && buffer.startsWith('[') && !buffer.includes('] ')) {
      return null; // Still forming
    }

    return {
      emotionTag,
      stateTag,
      text: remaining.trimStart(),
    };
  }

  // --- Process a complete utterance with natural timing variation ---
  async function processUtterance(text) {
    // Add subtle random delay (50-150ms) to avoid robotic-consistent response timing
    const delay = 50 + Math.floor(Math.random() * 100);
    await new Promise((r) => setTimeout(r, delay));

    tokenBuffer = '';
    prefixParsed = false;
    ttsStarted = false;

    const startTime = Date.now();
    await llm.generateResponse(text);
    const elapsed = Date.now() - startTime;
    logger.info({ latencyMs: elapsed }, 'Utterance processing time');
  }

  // --- Register Twilio handlers FIRST (lesson from v1) ---
  twilioWs.on('message', (message) => {
    let msg;
    try {
      msg = JSON.parse(message.toString());
    } catch {
      return;
    }

    switch (msg.event) {
      case 'connected':
        logger.info('Twilio stream: connected');
        break;

      case 'start':
        streamSid = msg.start.streamSid;
        callSid = msg.start.callSid;
        activeCalls.set(streamSid, { callSid, startTime: Date.now() });
        logger.info({ streamSid, callSid }, 'Twilio stream started');
        break;

      case 'media': {
        // Decode base64 mulaw and send to Deepgram
        const audioBuffer = Buffer.from(msg.media.payload, 'base64');
        asr.sendAudio(audioBuffer);
        break;
      }

      case 'stop':
        logger.info({ streamSid, callSid }, 'Twilio stream stopped');
        cleanup();
        break;
    }
  });

  twilioWs.on('close', () => {
    logger.info({ streamSid }, 'Twilio WebSocket closed');
    cleanup();
  });

  twilioWs.on('error', (err) => {
    logger.error({ err: err.message }, 'Twilio WebSocket error');
  });

  // --- Connect to external services ---
  try {
    await Promise.all([asr.connect(), tts.connect()]);
    logger.info('All services connected, generating greeting...');

    // Generate initial greeting
    tokenBuffer = '';
    prefixParsed = false;
    ttsStarted = false;
    await llm.generateGreeting();
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to connect services');
    twilioWs.close();
    return;
  }

  // --- Cleanup ---
  function cleanup() {
    if (cleaned) return;
    cleaned = true;

    asr.close();
    tts.close();
    llm.cancel();

    if (streamSid && activeCalls.has(streamSid)) {
      activeCalls.delete(streamSid);
    }

    const key = callSid || streamSid;
    if (key) {
      const lead = getLead(key);
      if (lead) {
        logger.info({ callSid: key, lead }, 'Call ended — lead captured');
      } else {
        logger.info({ callSid: key }, 'Call ended — no lead data');
      }
      deleteLead(key);
    }
  }
}

import { logger } from '../utils/logger.js';

// Voice settings tuned for expressiveness and tonal variation.
// Lower stability = more pitch variation = more human.
// Higher style = more expressive delivery.
const EMOTION_PROFILES = {
  cheerful:     { stability: 0.25, similarity_boost: 0.70, style: 0.90 },
  warm:         { stability: 0.30, similarity_boost: 0.75, style: 0.85 },
  reassuring:   { stability: 0.30, similarity_boost: 0.75, style: 0.80 },
  empathetic:   { stability: 0.20, similarity_boost: 0.65, style: 0.95 },
  professional: { stability: 0.45, similarity_boost: 0.80, style: 0.50 },
  urgent:       { stability: 0.35, similarity_boost: 0.80, style: 0.65 },
  calm:         { stability: 0.40, similarity_boost: 0.75, style: 0.60 },
};

const DEFAULT_PROFILE = EMOTION_PROFILES.cheerful;
const EMOTION_PREFIX_RE = /^\[EMOTION:(\w+)→(\w+)\]\s*/;

export class EmotionEngine {
  constructor() {
    this.history = [];
    this.currentCallerEmotion = 'calm';
    this.currentAiEmotion = 'cheerful';
  }

  /**
   * Parse the emotion prefix from LLM output.
   * Returns { callerEmotion, aiEmotion, cleanText }.
   */
  parseResponse(text) {
    const match = text.match(EMOTION_PREFIX_RE);
    if (match) {
      this.currentCallerEmotion = match[1];
      this.currentAiEmotion = match[2];
      this.history.push({
        caller: this.currentCallerEmotion,
        ai: this.currentAiEmotion,
        timestamp: Date.now(),
      });
      logger.info(
        { caller: this.currentCallerEmotion, ai: this.currentAiEmotion },
        'Emotion detected'
      );
      return {
        callerEmotion: this.currentCallerEmotion,
        aiEmotion: this.currentAiEmotion,
        cleanText: text.slice(match[0].length),
      };
    }

    // No prefix found — use current state
    return {
      callerEmotion: this.currentCallerEmotion,
      aiEmotion: this.currentAiEmotion,
      cleanText: text,
    };
  }

  /**
   * Get ElevenLabs voice parameters for the current AI emotion.
   */
  getVoiceSettings() {
    return EMOTION_PROFILES[this.currentAiEmotion] || DEFAULT_PROFILE;
  }

  /**
   * Detect emotion trend (escalating, de-escalating, stable).
   */
  getTrend() {
    if (this.history.length < 2) return 'stable';
    const recent = this.history.slice(-3);
    const escalationOrder = ['calm', 'confused', 'concerned', 'frustrated', 'panicked'];
    const scores = recent.map(
      (h) => escalationOrder.indexOf(h.caller)
    ).filter((s) => s !== -1);
    if (scores.length < 2) return 'stable';

    const first = scores[0];
    const last = scores[scores.length - 1];
    if (last > first) return 'escalating';
    if (last < first) return 'de-escalating';
    return 'stable';
  }

  /**
   * Get a summary string for including in the LLM system prompt.
   */
  getContextForPrompt() {
    const trend = this.getTrend();
    return `Current caller emotion: ${this.currentCallerEmotion}. Trend: ${trend}. Your default tone is cheerful and warm — only shift to empathetic or urgent if the caller is genuinely distressed.`;
  }
}

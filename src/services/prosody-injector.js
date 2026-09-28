/**
 * Prosody Injector — uses text formatting to influence TTS prosody.
 *
 * ElevenLabs WebSocket streaming doesn't support SSML, but it DOES
 * respond to punctuation and formatting cues in the text:
 *  - Commas create natural pauses
 *  - Em dashes (—) create abrupt pauses
 *  - Ellipses (...) create trailing-off effects
 *  - Question marks raise intonation
 *  - Periods create full stops with falling intonation
 *
 * This module applies light text formatting to enhance natural delivery.
 * The heavy lifting for naturalness comes from the LLM prompt (disfluencies).
 */

/**
 * Apply light text formatting for more natural TTS delivery.
 * @param {string} text — clean text from LLM (emotion prefix already stripped)
 * @returns {string} — formatted text
 */
export function injectProsody(text) {
  if (!text || text.length < 2) return text;

  // No transformation needed for streaming tokens — just pass through.
  // The LLM prompt handles disfluencies (uh, um, self-corrections).
  // ElevenLabs naturally handles punctuation prosody.
  return text;
}

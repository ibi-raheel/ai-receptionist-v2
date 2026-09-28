/**
 * Utterance Analyzer — determines if a caller's speech is a complete thought.
 *
 * Instead of hardcoded timers, this analyzes the actual content of transcripts
 * to decide whether to respond immediately or wait for more speech.
 *
 * Returns a dynamic wait time based on linguistic completeness signals.
 */

// Words that strongly signal the speaker hasn't finished
const INCOMPLETE_ENDINGS = new Set([
  // Conjunctions — "my name is Mohammed and..."
  'and', 'but', 'or', 'nor', 'so', 'because', 'since', 'although', 'though',
  'while', 'whereas', 'unless', 'until', 'if', 'whether',
  // Prepositions — "can you tell me about..."
  'about', 'for', 'with', 'to', 'from', 'at', 'in', 'on', 'by', 'into',
  'through', 'during', 'before', 'after', 'between', 'under', 'over',
  'of', 'like', 'than',
  // Articles — "I have a..."
  'a', 'an', 'the',
  // Pronouns starting a clause — "the thing that..."
  'who', 'which', 'that', 'where', 'when', 'how', 'what',
  // Possessives — "it's my..."
  'my', 'your', 'his', 'her', 'their', 'our', 'its',
  // Verbs that expect an object — "I need..."
  'is', 'are', 'was', 'were', 'been', 'am',
  // Demonstratives
  'this', 'that', 'these', 'those',
  // Other continuation signals
  'then', 'also', 'just', 'really', 'very', 'basically', 'actually',
  'probably', 'maybe', 'gonna', 'wanna', 'gotta',
]);

// Short complete responses — respond fast
const QUICK_RESPONSES = new Set([
  'yes', 'yeah', 'yep', 'yup', 'ya', 'yah',
  'no', 'nah', 'nope',
  'okay', 'ok', 'k',
  'sure', 'right', 'correct', 'exactly',
  'thanks', 'thank you',
  'bye', 'goodbye',
  'hello', 'hi', 'hey',
  'got it', 'gotcha',
  'uh huh', 'mhm', 'mm hmm',
  'absolutely', 'definitely', 'of course',
  'please', 'help',
]);

/**
 * Analyze a transcript buffer and return how long to wait before responding.
 *
 * @param {string} text - The accumulated transcript text
 * @returns {{ waitMs: number, reason: string }}
 *   - waitMs: How long to wait for more speech (0 = respond now via Deepgram utterance_end)
 *   - reason: Why this decision was made (for logging)
 */
export function analyzeUtterance(text) {
  if (!text || !text.trim()) {
    return { waitMs: 2000, reason: 'empty' };
  }

  const trimmed = text.trim();
  const lower = trimmed.toLowerCase().replace(/[.,!?;:]+$/g, '');

  // Check if it's a quick/short response — respond fast
  if (QUICK_RESPONSES.has(lower)) {
    return { waitMs: 300, reason: `quick-response: "${lower}"` };
  }

  // Get the last word (strip trailing punctuation for analysis)
  const words = trimmed.split(/\s+/);
  const lastWord = words[words.length - 1].toLowerCase().replace(/[.,!?;:]+$/g, '');
  const lastChar = trimmed[trimmed.length - 1];

  // Check for terminal punctuation (Deepgram adds these with punctuate=true)
  const hasTerminalPunctuation = lastChar === '.' || lastChar === '?' || lastChar === '!';

  // If ends with an incomplete word, definitely wait
  if (INCOMPLETE_ENDINGS.has(lastWord)) {
    return { waitMs: 3000, reason: `incomplete-ending: "${lastWord}"` };
  }

  // Terminal punctuation + enough words = likely complete
  if (hasTerminalPunctuation && words.length >= 2) {
    return { waitMs: 500, reason: 'complete-sentence' };
  }

  // Question mark = definitely complete
  if (lastChar === '?') {
    return { waitMs: 400, reason: 'question' };
  }

  // Very short (1-2 words) without punctuation — ambiguous, moderate wait
  if (words.length <= 2) {
    return { waitMs: 1200, reason: 'short-ambiguous' };
  }

  // Longer phrase without terminal punctuation — might be mid-thought
  if (!hasTerminalPunctuation && words.length >= 3) {
    return { waitMs: 1500, reason: 'no-punctuation' };
  }

  // Default: moderate wait
  return { waitMs: 800, reason: 'default' };
}

// Words that must not appear on the showcase (Sasha's decision 13.11: no mention of AI, do not name models).
// Matched at the word start, case-insensitive; "ии" (AI) only as a whole word.
export const STOPWORDS = [
  'ии',
  'ai',
  'chatgpt',
  'openai',
  'нейросет',
  'искусственн',
  'gpt',
  'claude',
  'gemini',
  'модел',
  'flux',
  'ace-step',
];

const WHOLE = new Set(['ии', 'ai']); // check 14.11: "AI" and "ChatGPT" were not caught
const L = '\\p{L}\\p{N}';

export function findStopwords(text) {
  const found = [];
  for (const w of STOPWORDS) {
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = WHOLE.has(w)
      ? new RegExp(`(?<![${L}])${esc}(?![${L}])`, 'iu')
      : new RegExp(`(?<![${L}])${esc}`, 'iu');
    if (re.test(text)) found.push(w);
  }
  return found;
}

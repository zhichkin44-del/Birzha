// Слова, которых не должно быть на витрине (решение Саши 13.11: без упоминаний ИИ, модели не называть).
// Ищем по началу слова, без учёта регистра; «ии» — только целым словом.
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

const WHOLE = new Set(['ии', 'ai']); // сверка 14.11: «AI» и «ChatGPT» не ловились
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

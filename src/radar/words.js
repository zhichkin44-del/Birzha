// Word lists for rules R1, R2, R5, R7. Edited without changing rule code (PLAN §2).
// A word matches as a word start (left boundary), so "верстк" catches "вёрстка/верстку" (layout forms).
// The radar's weakest spot: false "take it"/"no" verdicts caused by words (RISKS №5).

export const VACANCY = [
  'вакансия', 'оклад', 'в штат', 'штатн', 'полная занятость', 'full-time', 'трудоустро',
  // 14.11, sources beyond FL/Kwork: Telegram vacancy feeds and "hiring disguised as an order". The bare "штат" (staff) was removed: "штат Иллинойс" (state of Illinois) is not a vacancy
  'ищем в команду', 'ищем сотрудник', 'о вакансии', 'менеджер по', 'руководител', 'маркетолог', 'доход на ',
  // 14.11 evening, live run of Freelance.ru: "подработка на удалёнке" (remote side job) disguised as an order
  // 14.11, English sources (Freelancer.com, PeoplePerHour): vacancies disguised as orders
  'salary', 'we are hiring', 'full time position', 'full-time position', 'in-house', 'sales closer', 'commission only', 'part-time position', 'long-term position', 'ongoing role',
  'без опыта', 'опыт не обязателен', 'на удалёнку', 'на удаленку', 'требуется #модератор', 'выплата:', 'гражданств', 'помощник по', 'помощника по', 'помощник для', 'помощника для', 'заполнения анкет', 'заполнение анкет', 'новое направление', 'чат-менеджер', 'чат менеджер', 'обработк заяв', 'обработке заяв',
];

// R1: reviews and testing are not development.
export const REVIEW = ['отзыв', 'fake review', 'write reviews', 'review writing', 'review exchange', 'sample review', 'product review'];
export const TESTING = ['тестирован', 'beta tester', 'qa tester', 'app tester', 'user testing'];

// R2: not our product line (checked before "ours")
export const MANUAL_FILL = ['заполнение товарн', 'заполнение карточ', 'наполнение карточ', 'товарных карт', 'карточек товар'];
export const OUT_OF_LINE = [
  '1с', '1c', 'devops', 'ведение кабинет', 'ведение магазин', 'управление кабинет', 'ведение аккаунт',
  // 14.11 live FL: "SEO consultation" passed on the word "сайт" (site) inside "продвижению сайта" (promoting a site)
  'seo', 'сео', 'контекстная реклам', 'контекстной реклам', 'яндекс директ', 'яндекс.директ', 'яндекс-директ', 'таргетирован', 'таргет ', 'smm',
  // copy of someone else's site — not our work and legally disputed
  'revit', 'металлообработк', 'баннер', 'рабочую документац', 'вентиляц', 'запустить рекламу', 'запуск рекламы', 'запустить платную рекламу', 'разместить готовое объявлен', 'разместить объявлен', 'копию сайт', 'копия сайт', 'скопировать сайт', 'клон сайт', 'клонировать сайт', 'спапс',
  // 14.11, Weblancer / Freelance.ru / Telegram: "дизайн" (design) and "сайт" (site) in a description do not make an order ours (content, ads, video, games)
  'таргетолог', 'директолог', 'рилс', 'монтажер', 'монтажёр', 'инфлюенс', 'иллюстрац', 'сет-дизайн', // copywriting and brand books — in COPYWRITING / PRINT_DESIGN below (R2 merged from PR #15)
  'дизайнер пост', 'дизайнер сторис', 'дизайнер превью', 'дизайнер презентац', 'unity', 'unreal',
  // 14.11, English sources: ads, social media, assistants, photo/video shooting, data entry — not our product line
  'pcb layout', 'firmware', 'microcontroller', 'proposal writing', 'grant writing', 'flutter', 'mobile app', 'ios app', 'android app', 'google ads', 'facebook ads', 'meta ads', 'tiktok ads', 'ppc', 'social media manag', 'performance marketing', 'backlink', 'link building', 'virtual assistant', 'data entry', 'videographer', 'photographer', 'photo shoot', 'cold email', 'lead generation', 'appointment setter', 'cold call', 'influencer', 'shopify theme', 'amazon listing', 'game develop', 'blockchain', 'smart contract', 'crypto', 'nft', 'solidity',
];

// R2 (tightened 14.11 after a live run: "take it" verdicts passed a logo design, a copywriter, an A4 print catalog, a game bot that bypasses captcha).
// Pure design and print: not site UI/UX. Triggers only if the order has no real development words (BUILD_WORDS).
export const PRINT_DESIGN = [
  'логотип', 'лого ', 'айдентик', 'фирменн стил', 'фирменный стил', 'брендбук', 'полиграф', 'для печати', 'в печать', 'на печать',
  'а4', 'a4', 'формате а4', 'формате a4', 'буклет', 'листовк', 'визитк', 'флаер', 'упаковк', 'этикетк',
  'logo design', 'logo ', 'brochure', 'flyer', 'business card', 'packaging', 'brand identity', 'branding', 'poster', 'infographic', 'illustration', 'label design',
];
// Copywriting: they write texts, not sites. Also only without BUILD_WORDS.
export const COPYWRITING = [
  'копирайт', 'рерайт', 'написание текст', 'написать текст', 'написание стат', 'написать стат',
  'тексты для сайт', 'текст для сайт', 'текстов для сайт', 'текстов сайт', 'тексты сайт', 'текста для сайт', 'контент-план',
  'website copy', 'seo article', 'seo content', 'blog writing', 'content writer', 'ghostwrit', 'proofread', 'translat', 'transcri',
];
// Real development words: if present, the order is not "pure design/copywriting" (site + logo stays "take it").
// "сайт", "верстк", "дизайн", "разработ" are not in this list: "текстов сайта" (site texts), "верстка каталога" (catalog layout), "разработка логотипа" (logo development) are not development.
export const BUILD_WORDS = [
  'создание сайт', 'создать сайт', 'разработка сайт', 'разработать сайт', 'сделать сайт', 'нужен сайт', 'нужен лендинг', 'лендинг',
  'landing', 'tilda', 'тильд', 'wordpress', 'интернет-магазин', 'сайт-визитк', 'сайт визитк', 'бот', 'парсер', 'парсинг', 'автоматизац', 'интеграци', 'crm',
  'website', 'web site', 'web app', 'webapp', 'landing page', 'shopify', 'woocommerce', 'telegram bot', 'discord bot', 'whatsapp bot', 'chatbot', 'scraper', 'scraping', 'crawler', 'automation', 'automate', 'integration', 'dashboard', 'frontend', 'front-end', 'react', 'next.js', 'html',
];
// Game bots and captcha bypass: we do not bypass captchas (CLAUDE.md); games are not our product line.
export const GAME_OR_CAPTCHA = [
  // 14.11, English sources: gambling and captcha bypass
  'casino', 'sportsbook', 'betting', 'gambling', 'captcha bypass', 'bypass captcha', 'solve captcha', 'solving captcha', 'bypass recaptcha', 'bypass cloudflare', 'bypass protection', 'bot detection', 'roblox', 'minecraft',
  'black russia', 'blackrussia', 'блэк раша', 'блек раша', 'игровой бот', 'игровых бот', 'игрового бот', 'бот для игр', 'бота для игр',
  'бот в игр', 'бота в игр', 'бот для игры', 'бота для игры', 'minecraft', 'майнкрафт', 'roblox', 'роблокс',
  'cloudflare', 'обход защит', 'обхода защит', 'обход капч', 'обойти капч', 'обхода капч', 'обходом капч', 'обходить капч', 'антикапч', 'anticaptcha', 'anti-captcha', 'решение капч', 'решения капч', 'разгадыван',
];

// R2: our product line — site, landing page, bot, automation, parser, UI design
export const IN_LINE = [
  'сайт', 'лендинг', 'landing', 'верстк', 'вёрстк', 'tilda', 'тильд', 'wordpress', 'интернет-магазин',
  'бот', 'автоматизац', 'парсер', 'парсинг', 'интеграци', 'ui', 'ux', 'интерфейс', 'crm',
  // 14.11, English sources
  'website', 'web site', 'web app', 'telegram bot', 'discord bot', 'whatsapp bot', 'chatbot', 'chat bot', 'scraper', 'scraping', 'automation', 'web design', 'figma',
  // 14.11: bare "дизайн" (design) and "макет" (layout) let through logos, A4 catalogs and YouTube covers ("Макет готов. А как он будет выглядеть в печати?" — "Layout is ready. What will it look like in print?").
  // Now design counts as ours only when it is a site, landing page, interface, app or web.
  'веб-дизайн', 'веб дизайн', 'вебдизайн', 'дизайн сайт', 'дизайн лендинг', 'дизайн интерфейс', 'дизайн приложен', 'дизайн мобильн', 'дизайн-макет сайт', 'макет сайт', 'макет лендинг', 'макет интерфейс',
];

// R5: they ask for access to someone else's account or for secrets. The word "кабинет" (account/office) alone is not R5 (S04).
export const SECRETS = [
  'доступ к кабинет', 'доступ в кабинет', 'доступ к аккаунт', 'доступ к личному кабинет',
  'логин и пароль', 'пароль от', 'передам пароль', 'токен', 'api-ключ', 'api ключ', 'секретн',
  'your password', 'login credentials', 'login details', 'share your login', 'access to my account', 'access to my admin', 'use my account',
];

// R7: require a confirmed diploma / work experience
export const CREDENTIALS = ['диплом', 'стаж', 'опыт от', 'опыт работы от', 'подтвержденный опыт', 'подтверждённый опыт', 'bachelor', 'degree required', 'degree in', 'certification required'];

// "clarify" flag
export const CLARIFY = ['кабинет'];

const LEFT = '(?<![а-яёa-z0-9])';
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** First word from the list found in the text (word start), otherwise null. */
export function findWord(text, list) {
  const t = String(text).toLowerCase();
  for (const w of list) {
    if (new RegExp(LEFT + escape(w)).test(t)) return w;
  }
  return null;
}

// ---- "First order" profile (Sasha's order 14.11 evening): filter only by meaning "we can deliver in 1–5 days with Claude Code".
// In the product line: sites/landing pages, Telegram bots, parsers, automation, AI integrations, video/editing/voiceover, texts.
// Platform rules and print design (logos, A4 catalogs) are not up for discussion: PRINT_DESIGN stays "no".
export const FIRST_ALLOWED_OUT = ['копирайт', 'рилс', 'монтажер', 'монтажёр']; // were "not our product line"; in the "first order" profile they count as ours
export const FIRST_EXTRA_IN = [
  'видео', 'ролик', 'монтаж', 'озвуч', 'субтитр', 'reels', 'shorts', 'рилс',
  'копирайт', 'текст', 'стать', 'рерайт', 'контент',
  'нейросет', 'chatgpt', 'gpt', 'ии-', 'ии ', 'ai-', 'ai ', 'ассистент', 'n8n', 'make.com', 'zapier', 'скрипт', 'чат-бот', 'чатбот', 'mini app',
  'video editing', 'video edit', 'video production', 'youtube video', 'voiceover', 'voice-over', 'dubbing', 'subtitle', 'copywriting', 'blog post', 'ai assistant', 'ai agent', 'python script',
];

// Surveillance of people and face recognition — not taken in any profile (director 14.11: "searching for people by photo in social networks is surveillance").
export const SURVEILLANCE = ['stalk', 'doxx', 'face recognition', 'facial recognition', 'nsfw', 'porn', 'onlyfans', 'adult content', 'слежк', 'деанон', 'пробив', 'поиск людей по фото', 'поиск по фото', 'поиска на ии по фото', 'по фото через соц', 'распознаван', 'по лицу', 'по лицам', 'найти человека по',
  // 18+ content and other people's songs: not taken (content and rights risk), decided by the director's order 14.11
  '18+', 'эротик', 'интим', 'слова песни', 'текст песни', 'текста песни'];

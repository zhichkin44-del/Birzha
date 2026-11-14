// Каналы и режимы (PLAN §3; решил директор 14.11: где правила запрещают роботов — руками).
// Источники правил — PLAN §3, «Правила площадок — источники».
export const CHANNELS = {
  fl: { name: 'FL.ru', mode: 'manual', feed: 'https://www.fl.ru/projects/', pause_sec: 10, why: 'правила FL.ru не найдены и не прочитаны (14.11) — до чтения «руками»; robots.txt /projects/ не закрыт' },
  frru: { name: 'Freelance.ru', mode: 'manual', feed: 'https://freelance.ru/projects/', why: 'п. 5.10 правил запрещает роботов' },
  weblancer: { name: 'Weblancer', mode: 'manual', feed: null, why: 'правила не прочитаны, HTTP 403' },
  'tg-tilda': { name: 'Telegram @tilda_profi', mode: 'manual', feed: null, why: 'Telegram запрещает скрейпинг; новый адрес канала не записан' },
  kwork: { name: 'Kwork', mode: 'manual', feed: 'https://kwork.ru/projects', why: 'EN-условия запрещают роботов; список без рендера пуст' },
  profi: { name: 'Профи.ру', mode: 'manual', feed: null, why: 'в условиях запрещён парсинг' },
  habr: { name: 'Хабр Фриланс', mode: 'closed', feed: null, why: 'закрыт 28.02.2025' },
};

export const autoChannels = () => Object.entries(CHANNELS).filter(([, c]) => c.mode === 'auto').map(([id]) => id);
export const manualNames = () => Object.values(CHANNELS).filter((c) => c.mode === 'manual').map((c) => c.name);

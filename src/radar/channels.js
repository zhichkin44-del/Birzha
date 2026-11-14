// Каналы и режимы (PLAN §3; решил директор 14.11: где правила запрещают роботов — руками).
// Источники правил — PLAN §3, «Правила площадок — источники».
export const CHANNELS = {
  fl: { name: 'FL.ru', mode: 'auto', feed: 'https://www.fl.ru/projects/', pause_sec: 10, why: 'правила прочитаны 14.11: Соглашение (ред. 31.08.2026) и Приложение №2 не запрещают автоматическое чтение (слов бот/робот/парсинг нет); robots.txt /projects/ открыт для *; RSS закрыт в robots.txt — не берём', rules: 'Прил. №2 п. 2.6 «обход ограничений технических средств» и п. 2.3.4 «нарушение нормальной работы» — читаем 1 страницу, пауза 10 с, без входа и cookie; Соглашение п. 3.2.1 / 4.10 — личные данные заказчиков не храним и не передаём; Прил. №3 (требования к ПО) не опубликовано — перечитать при появлении' },
  frru: { name: 'Freelance.ru', mode: 'manual', feed: 'https://freelance.ru/projects/', why: 'п. 5.10 правил запрещает роботов' },
  weblancer: { name: 'Weblancer', mode: 'manual', feed: null, why: 'правила не прочитаны, HTTP 403' },
  'tg-tilda': { name: 'Telegram @tilda_profi', mode: 'manual', feed: null, why: 'Telegram запрещает скрейпинг; новый адрес канала не записан' },
  kwork: { name: 'Kwork', mode: 'auto', feed: 'https://kwork.ru/projects?c=11', pause_sec: 10, owner_decision: '14.11.2026, Саша: «всё равно на их правила, запускай Kwork, так же аккуратно»', why: 'решение владельца 14.11: условия запрещают роботов, берём на его риск; robots.txt /projects открыт (закрыты только ?page=, /search, /login); 1 страница категории «Разработка и IT» (c=11) без page, пауза 10 с, без входа, личные данные не храним', rules: 'условия Kwork запрещают роботов — риск владельца; читаем 1 страницу без page, пауза 10 с, без входа и cookie; имена и профили заказчиков не берём и не храним; при капче/403/429 — «руками»' },
  profi: { name: 'Профи.ру', mode: 'manual', feed: null, why: 'в условиях запрещён парсинг' },
  habr: { name: 'Хабр Фриланс', mode: 'closed', feed: null, why: 'закрыт 28.02.2025' },
};

export const autoChannels = () => Object.entries(CHANNELS).filter(([, c]) => c.mode === 'auto').map(([id]) => id);
export const manualNames = () => Object.values(CHANNELS).filter((c) => c.mode === 'manual').map((c) => c.name);

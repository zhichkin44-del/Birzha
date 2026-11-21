// Источники вне FL.ru и Kwork: Freelancehunt, Weblancer, Freelance.ru, Telegram-ленты (t.me/s). Задача «Заказы вне бирж», 14.11.2026.
// Фикстуры — синтетические копии настоящей вёрстки (настоящие страницы 14.11 разобраны вручную, см. шапки парсеров).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFreelancehunt, parseFreelancehuntChecked, postedMs } from '../src/radar/parsers/freelancehunt.js';
import { parseWeblancer, parseWeblancerChecked } from '../src/radar/parsers/weblancer.js';
import { parseFreelanceRu, parseFreelanceRuChecked } from '../src/radar/parsers/freelanceru.js';
import { parseTelegram, parseTelegramChecked } from '../src/radar/parsers/telegram.js';
import { scrubPersonal, moneyOf, textOf } from '../src/radar/parsers/common.js';
import { LayoutChangedError } from '../src/radar/fetch.js';
import { evaluate } from '../src/radar/rules.js';
import { runChannels } from '../src/radar/run.js';
import { statusLine } from '../src/radar/report.js';
import { CHANNELS, autoChannels } from '../src/radar/channels.js';

const fix = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NOW = '2026-11-14T12:00:00+07:00'; // = 05:00 UTC
const NOW2 = '2026-11-14T20:00:00+07:00'; // = 13:00 UTC
const PERSONAL = /@[A-Za-z]{4,}|\+7|salon@|owner@|hr@|t\.me\//;

// ---------- общее ----------
test('scrubPersonal: @имя, t.me-ссылка, почта и телефон вырезаются, текст остаётся', () => {
  const t = scrubPersonal('Писать @owner_test или t.me/owner_test, почта a.b@mail.ru, звонить +7 (900) 123-45-67 или 8 912 345 67 89. Сайт нужен.');
  assert.doesNotMatch(t, PERSONAL);
  assert.doesNotMatch(t, /mail\.ru|900|912/);
  assert.match(t, /Писать/);
  assert.match(t, /Сайт нужен/);
});

test('moneyOf: рубли, доллары, гривны → рубли по ориентиру; «Не указан» → null', () => {
  assert.deepEqual(moneyOf('95 000 ₽ / заказ'), { rub: 95000, raw: '95000 RUB' });
  assert.deepEqual(moneyOf('100 $'), { rub: 8000, raw: '100 USD' });
  assert.deepEqual(moneyOf('16 221 UAH'), { rub: 32442, raw: '16221 UAH' });
  assert.deepEqual(moneyOf('Не указан'), { rub: null, raw: null });
  assert.deepEqual(moneyOf('по договорённости'), { rub: null, raw: null });
  assert.equal(moneyOf('').rub, null);
});

test('textOf: теги, комментарии <!-- -->, сущности и невидимые символы убираются', () => {
  assert.equal(textOf('1000<!-- --> $ &amp; <b>да</b>&nbsp;нет​'), '1000 $ & да нет');
});

// ---------- Freelancehunt ----------
test('Freelancehunt: четыре карточки → три заказа (дубль номера отброшен), ссылки и id', () => {
  const o = parseFreelancehunt(fix('fh.synthetic.html'), NOW);
  assert.deepEqual(o.map((x) => x.id), ['fh-9000001', 'fh-9000002', 'fh-9000003']);
  assert.ok(o.every((x) => x.channel === 'fh' && x.collected_at === NOW));
  assert.equal(o[0].url, 'https://freelancehunt.com/project/telegram-bot-zapisi-klientov/9000001.html');
  assert.equal(o[0].title, 'Telegram-бот записи клиентов & напоминаний');
});

test('Freelancehunt: бюджет в гривнах → рубли, исходная валюта сохранена; «Не указан» → null', () => {
  const o = parseFreelancehunt(fix('fh.synthetic.html'), NOW);
  assert.equal(o[0].budget, 60000);
  assert.equal(o[0].budget_raw, '30000 UAH');
  assert.equal(o[1].budget, null);
  assert.equal(o[1].budget_raw, null);
});

test('Freelancehunt: ставки → answers (12, 1, 109)', () => {
  const o = parseFreelancehunt(fix('fh.synthetic.html'), NOW);
  assert.deepEqual(o.map((x) => x.answers), [12, 1, 109]);
});

test('Freelancehunt: дата «13 ноября» — начало суток (Киев), «10:13» — сегодня, а если ещё не наступило — вчера', () => {
  const o = parseFreelancehunt(fix('fh.synthetic.html'), NOW);
  assert.equal(o[0].posted_at, '2026-11-12T22:00:00.000Z');
  assert.equal(o[0].age_hours, 31);
  assert.equal(o[1].posted_at, '2026-11-13T08:13:00.000Z'); // 10:13 по Киеву = 08:13 UTC > 05:00 UTC сейчас → вчера
  assert.equal(o[1].age_hours, 20.78);
  assert.ok(Number.isNaN(postedMs('вчера', NOW)));
  assert.equal(new Date(postedMs('31 декабря', '2027-01-01T00:30:00Z')).toISOString(), '2026-12-30T22:00:00.000Z'); // декабрь — прошлый год
});

test('Freelancehunt: контакты заказчика в описании вырезаны', () => {
  const [a] = parseFreelancehunt(fix('fh.synthetic.html'), NOW);
  assert.doesNotMatch(a.text + a.title, PERSONAL);
  assert.match(a.text, /Нужен бот для салона/);
});

test('Freelancehunt: пустая страница с фразой — [], без фразы и без карточек — «вёрстка изменилась»', () => {
  assert.deepEqual(parseFreelancehuntChecked(fix('fh.empty.html'), NOW), []);
  assert.throws(() => parseFreelancehuntChecked('<html><body>что-то другое</body></html>', NOW), LayoutChangedError);
});

// ---------- Weblancer ----------
test('Weblancer: закрытый заказ и дубль пропущены; id и ссылка с www', () => {
  const o = parseWeblancer(fix('wl.synthetic.html'), NOW);
  assert.deepEqual(o.map((x) => x.id), ['wl-1270001', 'wl-1270002']);
  assert.equal(o[0].url, 'https://www.weblancer.net/freelance/sozdanie-botov-31/bot-dlya-zapisi-klientov-1270001/');
  assert.ok(o.every((x) => x.channel === 'weblancer'));
});

test('Weblancer: цена в долларах (с <!-- -->) → рубли; нет цены → null; заявки → answers', () => {
  const [a, b] = parseWeblancer(fix('wl.synthetic.html'), NOW);
  assert.equal(a.budget, 8000);
  assert.equal(a.budget_raw, '100 USD');
  assert.equal(b.budget, null);
  assert.deepEqual([a.answers, b.answers], [8, 1]);
});

test('Weblancer: дата без времени — начало суток по Москве', () => {
  const [a] = parseWeblancer(fix('wl.synthetic.html'), NOW);
  assert.equal(a.posted_at, '2026-11-12T21:00:00.000Z');
  assert.equal(a.age_hours, 32);
});

test('Weblancer: контакты вырезаны', () => {
  const [a] = parseWeblancer(fix('wl.synthetic.html'), NOW);
  assert.doesNotMatch(a.text, PERSONAL);
  assert.match(a.text, /Telegram-бот для салона/);
});

test('Weblancer: страница из одних закрытых — не «вёрстка»; совсем чужая страница — «вёрстка изменилась»', () => {
  const onlyClosed = fix('wl.synthetic.html').replace(/<article[\s\S]*?<\/article>/g, (m) => (m.includes('закрыт') ? m : ''));
  assert.deepEqual(parseWeblancerChecked(onlyClosed, NOW), []);
  assert.throws(() => parseWeblancerChecked('<html><body>Доступ ограничен</body></html>', NOW), LayoutChangedError);
});

// ---------- Freelance.ru ----------
test('Freelance.ru: три заказа, id, ссылка, раздел в начале текста', () => {
  const o = parseFreelanceRu(fix('frru.synthetic.html'), NOW2);
  assert.deepEqual(o.map((x) => x.id), ['frru-9000001', 'frru-9000002', 'frru-9000003']);
  assert.equal(o[0].url, 'https://freelance.ru/task/view/9000001');
  assert.ok(o[0].text.startsWith('Веб-разработка и IT. Нужен сайт-визитка'));
  assert.ok(o.every((x) => x.channel === 'frru'));
});

test('Freelance.ru: гонорар, срок, комментарии; «по договорённости» → null', () => {
  const o = parseFreelanceRu(fix('frru.synthetic.html'), NOW2);
  assert.equal(o[0].budget, 15000);
  assert.equal(o[0].deadline_days, 10);
  assert.equal(o[0].answers, 2);
  assert.equal(o[1].budget, 50);
  assert.equal(o[2].budget, null);
  assert.equal(o[2].deadline_days, null);
});

test('Freelance.ru: время из title по Москве → ISO и возраст; контакты вырезаны', () => {
  const o = parseFreelanceRu(fix('frru.synthetic.html'), NOW2);
  assert.equal(o[0].posted_at, '2026-11-14T07:42:00.000Z');
  assert.equal(o[0].age_hours, 5.3);
  assert.doesNotMatch(o[0].text, PERSONAL);
  assert.doesNotMatch(o[0].text, /\.\.\.$/); // обрезка «...» с карточки не тащим
});

test('Freelance.ru: нет карточек и нет фразы → «вёрстка изменилась»', () => {
  assert.throws(() => parseFreelanceRuChecked('<html><body>Авторизация</body></html>', NOW2), LayoutChangedError);
  assert.equal(parseFreelanceRuChecked(fix('frru.synthetic.html'), NOW2).length, 3);
});

// ---------- Telegram ----------
test('Telegram: пост без текста (картинка) пропущен, остальные — заказы канала tg-<имя>', () => {
  const o = parseTelegram(fix('tg.synthetic.html'), NOW2, 'FreelanceBay');
  assert.deepEqual(o.map((x) => x.id), ['tg-freelancebay-9000001', 'tg-freelancebay-9000003', 'tg-freelancebay-9000004']);
  assert.ok(o.every((x) => x.channel === 'tg-freelancebay'));
  assert.equal(o[0].url, 'https://t.me/FreelanceBay/9000001');
});

test('Telegram: заголовок — жирная строка без значка; реклама канала и контакты вырезаны; бюджет из текста', () => {
  const [a] = parseTelegram(fix('tg.synthetic.html'), NOW2, 'FreelanceBay');
  assert.equal(a.title, 'Telegram-бот записи для салона');
  assert.doesNotMatch(a.text, /Разместить|рекламу|Получать больше/);
  assert.doesNotMatch(a.text, PERSONAL);
  assert.equal(a.budget, 25000); // «25&nbsp;000 ₽»
  assert.equal(a.answers, null);
});

test('Telegram: время из datetime, возраст в часах; без жирного — заголовок из начала текста', () => {
  const o = parseTelegram(fix('tg.synthetic.html'), NOW2, 'FreelanceBay');
  assert.equal(o[0].posted_at, '2026-11-14T05:00:00.000Z');
  assert.equal(o[0].age_hours, 8);
  assert.equal(o[2].title, 'Лендинг для кофейни на Tilda, макет есть. Пишите в лс');
});

test('Telegram: канал без веб-превью (нет ленты) → «вёрстка изменилась», а не тихое «0»', () => {
  assert.throws(() => parseTelegramChecked(fix('tg.nopreview.html'), NOW2, 'programming_jobs'), LayoutChangedError);
  assert.equal(parseTelegramChecked(fix('tg.synthetic.html'), NOW2, 'FreelanceBay').length, 3);
});

// ---------- вердикты правил на новых источниках ----------
test('Правила: бот из Freelancehunt (60 000 ₽, 12 ставок) — «берём»', () => {
  const v = evaluate(parseFreelancehunt(fix('fh.synthetic.html'), NOW)[0]);
  assert.equal(v.verdict, 'берём');
});

test('Правила: AI-агент со 109 ставками, не свежий — R4; отзыв на Яндекс.Картах — R1', () => {
  const fh = parseFreelancehunt(fix('fh.synthetic.html'), NOW);
  assert.equal(evaluate(fh[2]).rule, 'R4');
  const fr = parseFreelanceRu(fix('frru.synthetic.html'), NOW2);
  assert.equal(evaluate(fr[1]).rule, 'R1');
});

test('Правила: вакансия из Telegram (оклад) — R1; лендинг на Tilda из Telegram — «берём»', () => {
  const tg = parseTelegram(fix('tg.synthetic.html'), NOW2, 'FreelanceBay');
  assert.equal(evaluate(tg[1]).rule, 'R1');
  assert.equal(evaluate(tg[2]).verdict, 'берём');
});

// Слова из настоящих страниц 14.11: ложные «берём» и ложный R1 (RISKS №5)
const real = (title, text = title) => evaluate({ title, text, budget: null, answers: 3, age_hours: 2, deadline_days: null, collected_at: '2026-11-14T10:00:00+03:00' });
test('Слова: «штат Иллинойс» не вакансия (Freelancehunt, AI-агент для строительной компании в США)', () => {
  assert.notEqual(real('Разработка AI-агента', 'Ищу разработчика автоматизации для компании (США, штат Иллинойс), нужен бот для поиска клиентов').rule, 'R1');
});
test('Слова: копирайтер, таргетолог, монтажёр, дизайнер постов, Unity — не наша линейка, даже если в тексте «сайт»', () => {
  for (const t of ['Ищем копирайтера для сайта', 'Требуется таргетолог, нужен ленд и ботов для уведомлений', 'Нужен монтажёр для сайта студии', 'Дизайнер постов и историй для свадебного салона, сайт есть', 'Разработчик Unity UGUI — набор интерфейса']) {
    assert.equal(real(t).rule, 'R2', t);
  }
});
test('Слова: вакансии из ленты Telegram («Ищем в команду», «Менеджер по продажам», «Руководитель проектов», «доход на 2–3 день») — R1', () => {
  for (const t of ['Ищем в команду разработчика, сайт компании', 'Менеджер по продажам CRM-системы автоматизации бизнеса', 'Руководитель проектов, автоматизация процессов', 'Доход на 2-3 день работы, свой сайт не нужен']) {
    assert.equal(real(t).rule, 'R1', t);
  }
});
test('Слова: настоящие заказы не потеряны — лендинг, бот записи, сайт-визитка, правки WordPress', () => {
  for (const t of ['Лендинг для услуги по вывозу мусора', 'Telegram-бот для записи клиентов', 'Сайт-визитка для стоматологии', 'Внесение правок для сайта WordPress']) {
    assert.equal(real(t).verdict, 'берём', t);
  }
});

// ---------- каналы, отчёт ----------
test('Каналы: новые авто-каналы с паузой 10 с, решением владельца, правилами и без страниц с page=/login', () => {
  const ids = ['fh', 'frru', 'weblancer', 'tg-freelancebay', 'tg-frwork3', 'tg-zakaz_design'];
  // fh и weblancer 14.11 отдали роботу Cloudflare-challenge (403) → «руками»: читаются сохранённой страницей, обход защиты не пишем
  for (const id of ['pchel', 'tg-freelancebay', 'tg-frwork3', 'tg-zakaz_design']) assert.ok(autoChannels().includes(id), id);
  for (const id of ['fl', 'frru', 'kwork']) assert.ok(!autoChannels().includes(id) && CHANNELS[id].blocked_note, `${id}: руками по правилам площадки`);
  assert.ok(autoChannels().filter((id) => id.startsWith('tg-')).length >= 15, 'Telegram-лент не меньше 15');
  for (const id of ['fh', 'weblancer']) assert.ok(CHANNELS[id].mode === 'manual' && /Cloudflare/.test(CHANNELS[id].blocked_note), id);
  for (const id of ids) {
    const c = CHANNELS[id];
    assert.ok(c.mode === 'auto' || c.blocked_note, id);
    assert.equal(c.pause_sec, 10, id);
    assert.ok((c.owner_decision || c.blocked_note) && c.why && c.rules, `${id}: решение владельца или причина «руками», основание и правила записаны`);
    for (const u of c.feeds ?? [c.feed]) {
      assert.match(u, /^https:\/\//, id);
      assert.doesNotMatch(u, /page=|login|\?.*=/i, `${u}: без параметров и входа`);
    }
  }
  assert.equal(CHANNELS.fh.feeds.length, 3);
  assert.equal(CHANNELS.weblancer.feeds.length, 3);
});

test('Каналы: ключ tg-<имя> совпадает с тем, что пишет парсер в order.channel', () => {
  for (const [id, c] of Object.entries(CHANNELS).filter(([, x]) => x.tg)) {
    const [o] = parseTelegram(fix('tg.synthetic.html'), NOW2, c.tg);
    assert.equal(o.channel, id);
  }
});

test('Раннер: часть страниц канала не открылась — заказы взяты, в строке состояния «частично» с причиной', async () => {
  const good = Object.assign(parseFreelancehunt(fix('fh.synthetic.html'), NOW), { warnings: ['/projects/skill/veb-programmirovanie/99.html: blocked: защита (HTTP 403)'] });
  const { records, report } = await runChannels([{ id: 'fh', load: async () => good }], { now: NOW });
  assert.equal(records.length, 3);
  assert.equal(report.channels.fh.status, 'ok');
  const line = statusLine(report, []);
  assert.match(line, /частично: fh/);
  assert.match(line, /403/);
});

test('Все новые парсеры: ни в одной записи нет @имён, почты, телефонов, t.me-ссылок на людей', () => {
  const all = [
    ...parseFreelancehunt(fix('fh.synthetic.html'), NOW),
    ...parseWeblancer(fix('wl.synthetic.html'), NOW),
    ...parseFreelanceRu(fix('frru.synthetic.html'), NOW2),
    ...parseTelegram(fix('tg.synthetic.html'), NOW2, 'FreelanceBay'),
  ];
  assert.ok(all.length >= 9);
  for (const o of all) assert.doesNotMatch(JSON.stringify(o).replace(/https:\/\/t\.me\/FreelanceBay\/\d+/g, ''), PERSONAL, o.id);
});

test('Отчёт: бюджет в гривнах/долларах показан с исходной валютой и пересчётом, в рублях — как раньше', async () => {
  const { renderMorning } = await import('../src/radar/report.js');
  const rec = (budget, budget_raw) => ({ id: 'x', channels: ['fh'], title: 'Бот', verdict: 'берём', reason: 'R1–R7 пройдены', flags: [], budget, budget_raw, answers: 3, age_hours: 2, url: 'https://x' });
  assert.match(renderMorning([rec(60000, '30000 UAH')], { channels: {}, silent: [], collected: 1 }), /30000 UAH \(≈60000 ₽\)/);
  assert.match(renderMorning([rec(15000, '15000 RUB')], { channels: {}, silent: [], collected: 1 }), /15000 ₽/);
  assert.match(renderMorning([rec(5000, undefined)], { channels: {}, silent: [], collected: 1 }), /5000 ₽/);
});

test('PARSERS: у каждого авто-канала есть парсер, и он читает фикстуру своего канала', async () => {
  const { PARSERS } = await import('../src/radar/parsers/index.js');
  for (const id of [...autoChannels(), 'fh', 'weblancer']) assert.equal(typeof PARSERS[id], 'function', id);
  assert.equal(PARSERS.fh(fix('fh.synthetic.html'), NOW).length, 3);
  assert.equal(PARSERS.weblancer(fix('wl.synthetic.html'), NOW).length, 2);
  assert.equal(PARSERS.frru(fix('frru.synthetic.html'), NOW2).length, 3);
  assert.equal(PARSERS['tg-freelancebay'](fix('tg.synthetic.html'), NOW2).length, 3);
});

test('Слова: логотип, каталог А4, «Макет готов… в печати» — не наша линейка; веб-дизайнер на Tilda и дизайн интерфейса — наша', () => {
  for (const t of ['Дизайн логотипа и айдентики', 'Каталог продукции в формате А4', 'Макет готов. А как он будет выглядеть в печати?']) assert.equal(real(t).rule, 'R2', t);
  for (const t of ['Требуется веб-дизайнер на Тильду', 'Дизайн интерфейса мобильного приложения', 'Дизайн лендинга в фигме']) assert.equal(real(t).verdict, 'берём', t);
});

// ---------- Pchel.net ----------
import { parsePchel, parsePchelChecked } from '../src/radar/parsers/pchel.js';

test('moneyOf: знак валюты перед суммой («$33») читается', () => {
  assert.deepEqual(moneyOf('$33'), { rub: 2640, raw: '33 USD' });
  assert.deepEqual(moneyOf('По договоренности'), { rub: null, raw: null });
});

test('Pchel.net: два заказа (дубль номера отброшен), цена в $ → ₽, заявки, раздел в тексте, контакты вырезаны, даты нет', () => {
  const o = parsePchel(fix('pchel.synthetic.html'), NOW);
  assert.deepEqual(o.map((x) => x.id), ['pchel-9100001', 'pchel-9100002']);
  assert.equal(o[0].url, 'https://pchel.net/jobs/website-development/lending-dlya-kofeyni-9100001/');
  assert.equal(o[0].budget, 8000);
  assert.equal(o[0].budget_raw, '100 USD');
  assert.deepEqual([o[0].answers, o[1].answers], [9, 2]);
  assert.equal(o[1].budget, null);
  assert.ok(o[0].text.startsWith('Разработка сайтов, Лендинги. Нужен лендинг'));
  assert.doesNotMatch(o[0].text, PERSONAL);
  assert.equal(o[0].age_hours, null);
  assert.equal(o[0].channel, 'pchel');
});

test('Pchel.net: чужая страница → «вёрстка изменилась»', () => {
  assert.throws(() => parsePchelChecked('<html><body>Вход</body></html>', NOW), LayoutChangedError);
});

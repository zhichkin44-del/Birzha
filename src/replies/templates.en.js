// English reply templates ("first order from English channels" task, 14.11). The same work kinds and the same facts as docs/portfolio/REPLIES.md (EN blocks).
// Same rules as the Russian ones: first person, short (4–6 lines), no word "AI", no model names (showcase stop-words), no invented reviews or numbers.
// "Similar work" comes only from real cases (works.json: w1, w3, w4, w5, w6) and works in docs/portfolio/demos/*.
// A public link only if the case has checked:true; otherwise honestly "screenshots on request".
import { REPLY_FROM, REPLY_TO } from '../radar/rules.js';

// Hours are in the client's time: for English-language platforms UTC (UTC+7 − 7 h), the same as the Russian replies "by Moscow time" (14.11).
export const HOURS_LINE_EN = `I reply daily between ${REPLY_FROM - 7}:00 and ${REPLY_TO - 7}:00 UTC.`;

// Prices are the catalog reference in rubles (templates.ru.js), converted to USD for display at the same rate 80 ₽/$; Sasha did not confirm them.
export const EN_SPEC = {
  landing: { what: 'a landing page', how: 'I build landing pages turnkey: a clear first screen, a lead form wired to your CRM or spreadsheet, fast and neat on phone and desktop.', need: 'your copy and logo', price: 8000, days: 4, question: 'Do you already have the copy and photos, or should we write the text together?' },
  site: { what: 'a website', how: 'I build the site: structure, a layout that works on phone and desktop, a contact form, and launch on your hosting.', need: 'your copy, logo and photos', price: 8000, days: 5, question: 'Do you have a design or copy ready, or are we starting from scratch?' },
  fix: { what: 'a fix for your website', how: 'I first look at the site and tell you what I will change and how long it takes, then do it. I save a backup copy before editing.', need: 'the site address and a list of edits (screenshots are fine)', price: 3000, days: 2, question: 'What exactly is wrong now, and what is the site built on (Tilda, WordPress, hand-coded)?' },
  bot: { what: 'a Telegram bot', how: 'I build Telegram bots: the client answers a few simple questions or books on their own, and you get the request at once and in a spreadsheet. Before you pay I make a trial sample of your scenario.', need: 'the scenario in 3-4 steps', price: 5000, days: 4, question: 'Where should requests arrive: direct messages or a work chat, and which steps must the client go through?' },
  botGeneric: { what: 'a bot', how: 'I build the bot for your task (in Telegram unless you need another platform): you describe the scenario, I build a working version, show it on your data and refine it after your notes.', need: 'the scenario and sample messages', price: 5000, days: 4, question: 'What should the bot do step by step, and where does it get its data?' },
  parser: { what: 'a scraper', how: 'I build a scraper that pulls the data you need from a site into a spreadsheet or file on a schedule; I show the result on a small part first. I do not bypass captchas or access protection.', need: 'the site address and the fields you need', price: 4000, days: 3, question: 'Which exact fields do you need, and how often should the data refresh?' },
  automation: { what: 'the automation', how: 'I remove manual work: data from a site, spreadsheet or email goes to the right place on its own and you get a report in Telegram. I first show the result on a small part of your data.', need: 'a sample of the data', price: 4000, days: 3, question: 'What is done by hand now, and where does the data come from?' },
  ai: { what: 'an automated assistant', how: 'I connect an assistant that answers from your materials (price list, FAQ, documents) and calls a person when it has no answer; we first test it on 10-20 real questions.', need: 'your materials (files or links)', price: 6000, days: 5, question: 'Which materials should it answer from, and where will it run: website or messenger?' },
  video: { what: 'video editing', how: 'I edit the videos: cuts, captions, sound and music, the format you need; I send one or two for approval first, the rest in batches. A trial fragment before ordering is free.', need: 'the source footage and format wishes', price: 3000, days: 3, question: 'What format and length do you need, and is there an example to follow?' },
  dub: { what: 'translation and voice-over for your video', how: 'I translate the text, record the voice-over, lay it over the video and add subtitles; I send a short fragment for approval first.', need: 'the source video and the text or subtitles', price: 3000, days: 3, question: 'Do you need subtitles, and should the voice be male or female?' },
  image: { what: 'images from your description', how: 'I make a set of images from your description and send several options to choose from; I use photos of real people only with their consent.', need: 'the description and style examples', price: 3000, days: 2, question: 'What are the images for, and is there a style example?' },
  text: { what: 'the texts', how: 'I write the texts for your task, no filler; I send one paragraph first so you can approve the tone.', need: 'the topic, audience and length', price: 3000, days: 2, question: 'Who are the texts for, and what length do you need?' },
  design: { what: 'interface design', how: 'I draw the screens for phone and desktop and assemble a clickable mockup; the first screen goes to you for approval.', need: 'your wishes and examples you like', price: 5000, days: 3, question: 'Do you have brand colors and examples to follow?' },
};

// Cases: no client names, no numbers beyond the verified ones. link only if checked:true in works.json.
export const CASES_EN = {
  w1: { title: 'Landing page for an English school (Tilda)', pitch: 'A landing page for an English school on Tilda: requests go straight to the CRM and you can see which ad each client came from.', link: null },
  w3: { title: 'Order radar (secretary)', pitch: 'An order radar: collects offers from open sources, scores each and drafts a reply; a person sends it.', link: null },
  w4: { title: 'Zhichkin News (automated newsroom)', pitch: 'An automated channel newsroom: reads about a hundred sources, drafts a post, and checks pass it or send it back.', link: 'https://zhichkin44-del.github.io/projects/studio-news/' },
  w5: { title: 'Video studio', pitch: 'A video pipeline from script and voice-over to editing and quality checks, behind a popular-science channel.', link: 'https://zhichkin44-del.github.io/projects/video-studio/' },
  w6: { title: 'Zokul messenger', pitch: 'In my messenger Zokul an automated helper asks a question and a person answers with one tap.', link: 'https://zhichkin44-del.github.io/projects/zokul/' },
  d_cafe: { title: 'Landing pages (coffee shop, renovation crew)', pitch: 'Landing pages for a coffee shop and a renovation crew.', link: null },
  d_site: { title: 'Business-card site', pitch: 'A business-card site for a manicure master.', link: null },
  d_bot: { title: 'Booking bot', pitch: 'A booking bot for a barbershop: pick a service, barber, day and time, with reminders before the visit.', link: null },
};
export const CASE_FOR_EN = { dub: ['w5'], image: ['w5'], bot: ['d_bot', 'w6'], parser: ['w3'], automation: ['w3', 'w4'], ai: ['w3', 'w4'], video: ['w5'], text: ['w4'], landing: ['w1', 'd_cafe'], site: ['d_site', 'w6'], fix: ['w1'], design: ['w6'] };

export function casesForEn(kind) {
  return (CASE_FOR_EN[kind] ?? []).slice(0, 2).map((id) => ({ id, ...CASES_EN[id] }));
}

const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** Price in dollars from the 80 ₽/$ reference rate, rounded to $5. */
export const usd = (rub) => `$${fmt(Math.max(5, Math.round(rub / 80 / 5) * 5))}`;

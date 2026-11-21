// Builds the showcase: src/vitrina/works.json → site/index.html.  Run: node src/vitrina/build.js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fact(f) {
  return `      <div${f.wide ? ' class="wide"' : ''}><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`;
}

function card(w) {
  const shots = (w.shots ?? []).map((s) => `      <div class="shot">${esc(s)}</div>`).join('\n');
  return `  <article class="card" id="${esc(w.id)}">
    <span class="tag">${esc(w.tag)}</span>
    <h2>${esc(w.title)}</h2>
    <p><b>Для кого:</b> ${esc(w.forWhom)}</p>
    <p><b>Что сделано:</b> ${esc(w.done)}</p>
    <dl class="facts">
${(w.facts ?? []).map(fact).join('\n')}
    </dl>${w.stack ? `\n    <p><b>Стек:</b> ${esc(w.stack)}</p>` : ''}${w.limits ? `\n    <p class="muted small">${esc(w.limits)}</p>` : ''}
${w.link ? `    <p><a href="${esc(w.link.url)}">${esc(w.link.label)}</a></p>\n` : ''}    <div class="shots" aria-label="Снимки">
${shots}
    </div>
  </article>`;
}

function contact(c) {
  const body = c.url
    ? `<a class="btn" href="${esc(c.url)}">${esc(c.label)}</a>`
    : `<p class="muted">${esc(c.empty)}</p>`;
  return `  <section class="card" id="contact">
    <h2>${esc(c.title)}</h2>
    ${body}
  </section>`;
}

export function render(data) {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(data.title)}</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<main class="wrap">

  <header>
    <h1>${esc(data.h1)}</h1>
    <p class="muted">${esc(data.lead)}</p>
  </header>

${data.works.map(card).join('\n\n')}

  <section class="card" id="terms">
    <h2>${esc(data.terms.title)}</h2>
    <ul class="plain">
${data.terms.lines.map((l) => `      <li>${esc(l)}</li>`).join('\n')}
    </ul>
  </section>

${contact(data.contact)}

</main>
</body>
</html>
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const data = JSON.parse(readFileSync(new URL('./works.json', import.meta.url), 'utf8'));
  const out = new URL('../../site/index.html', import.meta.url);
  mkdirSync(new URL('../../site/', import.meta.url), { recursive: true });
  writeFileSync(out, render(data));
  console.log(`site/index.html: ${data.works.length} works`);
}

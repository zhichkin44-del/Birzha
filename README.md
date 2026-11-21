# Birzha

A freelance order radar and showcase toolkit for Russian-speaking freelancers: it collects job listings from freelance sites and Telegram channels, scores them against a fixed set of rules, drafts reply packages for the best matches, and builds a static portfolio page.

**Interface language: Russian.** The product targets the Russian freelance market, so the user-facing site, reply texts and digests are in Russian (English templates are included for English-language platforms). Code comments and documentation are being translated to English.

## Features

- **Order radar** (`src/radar`): reads public listings from configured sources (Pchel.net, Freelancer.com, PeoplePerHour, Telegram public channels, and others). FL.ru, Kwork and Freelance.ru are manual-only by default. Each source has its own parser in `src/radar/parsers`.
- **Offline mode**: parse a page you saved yourself (`--file page.html --channel <id>`), for sources that block automated access.
- **Rule-based filter**: each order gets a verdict (`rules.js`, `words.js`) and duplicates are removed (`dedupe.js`).
- **Daily digest** (`src/digest`): top orders of the day with a ready reply for each (`--digest`).
- **Reply packages** (`src/replies`): price, timeline, relevant works and questions for an order, in Russian and English. A validator flags discount wording and other unwanted phrases.
- **Showcase page** (`src/vitrina`): builds `site/index.html` from `src/vitrina/works.json`.

## Requirements

- **Node.js 21 or newer** (ES modules and the `node --test` glob need it). Tested with Node 24.22.1 on Windows 11.
- **No npm dependencies**: nothing to install beyond Node.
- **Network access** is needed only for `--live` radar runs. Tests and offline runs work without it.
- **No API keys, accounts or external services** are required.
- Operating systems: Windows 11, macOS and Linux (the test suite is plain Node; the install-check workflow runs on Ubuntu and Windows).

## Installation

### Windows (PowerShell)

1. Install Node.js 24 LTS from https://nodejs.org and open a new PowerShell window.
2. Check the version:
   ```powershell
   node --version
   ```
   Expected: `v21.x` or newer.
3. Install Git from https://git-scm.com if `git --version` fails, then clone the repository:
   ```powershell
   git clone https://github.com/zhichkin44-del/Birzha.git
   cd Birzha
   ```
4. Run the tests:
   ```powershell
   npm test
   ```

### macOS and Linux (bash)

1. Install Node.js 24 LTS (from https://nodejs.org or your package manager) and check `node --version`.
2. Clone and test:
   ```bash
   git clone https://github.com/zhichkin44-del/Birzha.git
   cd Birzha
   npm test
   ```

## Configuration

The project reads no environment variables and needs no `.env` file or API keys, so there is no `.env.example`. Radar sources are configured in code, in `src/radar/channels.js`: each source has `mode` (`auto` or `manual`), a feed URL and a `why`/`rules` note.

Use automated collection only where the site's terms allow it. Sources whose terms prohibit automated access are `manual` by default; to read them, save the page yourself and pass it with `--file`.

## Usage

**First run (offline, no network):** parse a sample page and print the verdicts.

```bash
node src/radar/cli.js --file test/fixtures/fl.synthetic.html
```

Expected: a line `собрано 3 заказов из 1 каналов`, then one line per order with its verdict. The output is in Russian, as the product is for the Russian market.

**Live collection** (network required; sources in `auto` mode only):

```bash
node src/radar/cli.js --live
node src/radar/cli.js --live --digest
```

Results go to `data/` (git-ignored): `data/orders/<day>.jsonl` and `data/morning-<day>.txt`.

**Reply packages** from a saved orders file:

```bash
node src/replies/build.js test/fixtures/orders.verdict.json --out data/replies.md
```

**Rebuild the showcase page:**

```bash
node src/vitrina/build.js
```

## Tests

```bash
npm test
```

Last run: 2026-11-21, Windows 11, Node 24.22.1: 194 tests, 194 passed, 0 failed.

## Project structure

- `src/radar/` - order collection, parsers, rules, dedupe, reports, CLI
- `src/digest/` - daily top-10 digest with reply drafts
- `src/replies/` - reply package builder and templates (RU, EN)
- `src/vitrina/` - showcase data (`works.json`) and page builder
- `site/` - generated showcase page and styles
- `test/` - test suite and HTML/JSON fixtures (synthetic copies of pages)
- `demos/`, `docs/` - demo materials and product documentation
- `.github/workflows/` - CI, including the install check

## License

MIT. Copyright (c) 2026 zhichkin44-del. See [LICENSE](LICENSE).

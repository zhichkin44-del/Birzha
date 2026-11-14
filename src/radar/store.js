// Хранение (PLAN §5): JSON Lines по файлу на день + state.json. Папка data/ в .gitignore.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dayFile = (dir, day) => join(dir, 'orders', `${day}.jsonl`);

export function loadDay(dir, day) {
  const f = dayFile(dir, day);
  if (!existsSync(f)) return [];
  return readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

/** Повторный сбор того же id заменяет запись (PLAN §4); id нет — берём канал+заголовок. Отметки Саши сохраняются. */
export function saveRecords(dir, day, records) {
  const byId = new Map(loadDay(dir, day).map((r) => [r.id, r]));
  for (const r of records) {
    const id = r.id ?? `${r.channel}-${r.title}`;
    const old = byId.get(id);
    byId.set(id, { ...r, id, owner_mark: old?.owner_mark ?? r.owner_mark ?? null });
  }
  mkdirSync(join(dir, 'orders'), { recursive: true });
  writeFileSync(dayFile(dir, day), [...byId.values()].map((r) => JSON.stringify(r)).join('\n') + '\n');
}

const stateFile = (dir) => join(dir, 'state.json');
export function loadState(dir) {
  return existsSync(stateFile(dir)) ? JSON.parse(readFileSync(stateFile(dir), 'utf8')) : {};
}
export function saveState(dir, state) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(stateFile(dir), JSON.stringify(state, null, 2) + '\n');
}

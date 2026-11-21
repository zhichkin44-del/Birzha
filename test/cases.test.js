// Radar case runner: docs/briefs/radar/test-cases.json (format — PLAN.md §6, "runner input format").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluate } from '../src/radar/rules.js';
import { mergeOrders } from '../src/radar/dedupe.js';
import { runChannels } from '../src/radar/run.js';
import { BlockedError } from '../src/radar/fetch.js';

const cases = JSON.parse(
  readFileSync(new URL('../docs/briefs/radar/test-cases.json', import.meta.url), 'utf8'),
);

test('the case set contains 21 cases (PLAN §2)', () => {
  assert.equal(cases.length, 21);
});

function checkVerdict(got, expect, id) {
  if ('verdict' in expect) assert.equal(got.verdict, expect.verdict, `${id}: verdict`);
  if ('rule' in expect) assert.equal(got.rule, expect.rule, `${id}: rule`);
  if (expect.reason_contains) {
    assert.ok(
      String(got.reason).includes(expect.reason_contains),
      `${id}: reason «${got.reason}» не содержит «${expect.reason_contains}»`,
    );
  }
  if (expect.flags) assert.deepEqual([...got.flags].sort(), [...expect.flags].sort(), `${id}: flags`);
}

for (const c of cases) {
  const { id, input, expect } = c;
  if (input.fetch_result) {
    test(`${id}: channel unavailable — the others are collected, the report says "канал молчит" (channel silent)`, async () => {
      const channels = [
        {
          id: input.channel,
          load: async () => {
            throw new BlockedError(input.http_status);
          },
        },
        ...input.other_channels_ok.map((cid) => ({
          id: cid,
          load: async () => [
            { channel: cid, title: 'Лендинг для кофейни', text: 'Нужен лендинг', budget: 8000, answers: 3, age_hours: 1, deadline_days: 5, collected_at: '2026-11-13T12:00:00+07:00' },
          ],
        })),
      ];
      const out = await runChannels(channels, { now: '2026-11-13T12:00:00+07:00' });
      const rep = out.report.channels[input.channel];
      assert.equal(rep.flag, expect.channel_flag);
      assert.ok(rep.reason.includes(expect.reason_contains), rep.reason);
      assert.equal(out.records.filter((r) => r.channels.includes(input.channel)).length, 0);
      if (expect.other_channels_collected) {
        for (const cid of input.other_channels_ok) {
          assert.equal(out.report.channels[cid].status, 'ok', `${cid} собран`);
          assert.ok(out.records.some((r) => r.channels.includes(cid)), `${cid}: есть записи`);
        }
      }
    });
  } else if (input.orders) {
    test(`${id}: a duplicate from two channels is merged`, () => {
      const records = mergeOrders(input.orders);
      assert.equal(records.length, expect.records);
      assert.deepEqual(records[0].channels, expect.channels);
      checkVerdict(evaluate(records[0]), expect, id);
    });
  } else if (input.title !== undefined) {
    test(`${id}: ${expect.verdict} ${expect.rule ?? ''}`.trim(), () => {
      checkVerdict(evaluate(input), expect, id);
    });
  } else {
    test(`${id}: unknown case shape`, () => {
      assert.fail('раннер не знает такой формы input');
    });
  }
}

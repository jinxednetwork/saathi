import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSystemPrompt,
  buildContext,
  buildMessages,
  safetyGate,
  crisisReply
} from '../src/prompts.js';
import { analyze } from '../src/engine.js';

const TODAY = Date.UTC(2026, 5, 13);

test('system prompt carries the absolute safety clause', () => {
  const sys = buildSystemPrompt().toLowerCase();
  assert.ok(sys.includes('never'));
  assert.ok(sys.includes('self-harm') || sys.includes('self harm'));
  assert.ok(sys.includes('helpline'));
  assert.ok(sys.includes('not a substitute'));
  assert.ok(sys.includes('plain text'));
});

test('buildContext grounds the prompt in insights', () => {
  const insights = analyze(
    [
      { text: 'cant sleep, exhausted, so tired before exam', mood: 2, ts: TODAY - 86400000 },
      { text: 'parents expectations, scared to disappoint them', mood: 2, ts: TODAY }
    ],
    { exam: 'JEE', examDate: '2026-07-01', today: TODAY }
  );
  const ctx = buildContext(insights);
  assert.ok(ctx.includes('JEE'));
  assert.ok(/day/.test(ctx));
  assert.ok(/Sleep|Family/.test(ctx));
});

test('buildContext is empty for empty insights', () => {
  assert.equal(buildContext({}), '');
});

test('buildMessages places system first, user last, drops stray system turns', () => {
  const msgs = buildMessages(
    'I feel stuck',
    analyze([{ text: 'stressed', mood: 2, ts: TODAY }], { today: TODAY }),
    [
      { role: 'system', content: 'should be dropped' },
      { role: 'assistant', content: 'earlier reply' }
    ]
  );
  assert.equal(msgs[0].role, 'system');
  assert.equal(msgs[msgs.length - 1].role, 'user');
  assert.equal(msgs[msgs.length - 1].content, 'I feel stuck');
  assert.equal(msgs.filter((m) => m.role === 'system').length, 1);
});

test('safetyGate blocks on a crisis message and returns a helpline reply', () => {
  const res = safetyGate('I want to die', {});
  assert.equal(res.gated, true);
  assert.ok(res.reply.includes('14416')); // Tele-MANAS
  assert.ok(res.reply.toLowerCase().includes('not a substitute'));
});

test('safetyGate blocks when history-derived insights are flagged', () => {
  const insights = analyze([{ text: 'I just want to die', mood: 1, ts: TODAY }], { today: TODAY });
  assert.equal(safetyGate('hello', insights).gated, true);
});

test('safetyGate passes ordinary messages through', () => {
  const insights = analyze([{ text: 'stressed about rank', mood: 2, ts: TODAY }], { today: TODAY });
  assert.equal(safetyGate('how do I focus better?', insights).gated, false);
});

test('crisisReply lists all helplines', () => {
  const reply = crisisReply();
  assert.ok(reply.includes('14416'));
  assert.ok(reply.includes('1800-599-0019'));
  assert.ok(reply.includes('+91-9152987821'));
});

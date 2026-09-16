import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatPanel } from '@/components/chat/ChatPanel';

/**
 * The thumbs on an assistant bubble follow the MESSAGE: they render only when
 * the backend gave the row an id (`serverMessageId`), and the selected thumb
 * is the one the message's own `rating` names. There is no component-local
 * rated map any more — a rating is a fact about the message in the store.
 *
 * renderToStaticMarkup only; never a client root.
 */

const UUID = '3f2a9c1e-7b4d-4e8a-9c21-0d5e6f7a8b9c';

/** A store shaped like useChatStore's return. */
const storeWith = (messages) => ({
  init() {},
  send() {},
  reset() {},
  rate() {},
  messages,
  isLoading: false,
  error: '',
  errorCode: '',
  lastAssistant: messages.findLast?.((m) => m.role === 'assistant') ?? null,
  sessionId: 'sess-test',
});

const USER = { id: 'u1', role: 'user', text: 'อยากเรียน Power BI', createdAt: 1 };
const assistant = (extra) => ({
  id: 'a1', role: 'assistant', text: 'แนะนำหลักสูตรพื้นฐานครับ', createdAt: 2,
  quickReplies: [], courses: [], promotions: [], serverMessageId: null, rating: null, ...extra,
});

const render = (messages) => renderToStaticMarkup(createElement(ChatPanel, { onClose() {}, store: storeWith(messages) }));

/** The two thumb buttons, by their titles, as [html, …]. */
const thumbs = (html) => html.match(/<button[^>]*title="(มีประโยชน์|ต้องปรับปรุง)"[^>]*>/g) ?? [];

test('a bubble WITH serverMessageId shows both thumbs, neither selected, both enabled', () => {
  const html = render([USER, assistant({ serverMessageId: UUID })]);
  const btns = thumbs(html);
  assert.equal(btns.length, 2, `expected two thumb buttons, saw ${btns.length}`);
  for (const b of btns) {
    assert.match(b, /aria-pressed="false"/, 'nothing selected yet');
    assert.doesNotMatch(b, /\sdisabled(=|\s|>)/, 'both enabled');
  }
  assert.match(html, /data-chat-rating="none"/);
});

test('a bubble WITHOUT serverMessageId shows NO thumbs — including a transcript restored from before the field existed', () => {
  for (const [label, msg] of [
    ['null', assistant({ serverMessageId: null })],
    ['absent (old transcript)', (() => { const m = assistant(); delete m.serverMessageId; delete m.rating; return m; })()],
    ['the apology bubble', assistant({ text: 'ขออภัย ระบบแชตมีปัญหาชั่วคราว ลองใหม่อีกครั้งได้ไหมครับ', serverMessageId: null })],
  ]) {
    const html = render([USER, msg]);
    assert.equal(thumbs(html).length, 0, `${label}: thumbs rendered`);
    assert.doesNotMatch(html, /data-chat-rating=/, `${label}: the rating row rendered`);
    assert.ok(html.includes(msg.text), `${label}: the bubble itself still renders`);
  }
});

test('a bubble rated "up" marks that thumb as selected (and disabled); the other thumb is still enabled', () => {
  const html = render([USER, assistant({ serverMessageId: UUID, rating: 'up' })]);
  const [up, down] = thumbs(html);
  assert.match(up, /title="มีประโยชน์"/);
  assert.match(up, /aria-pressed="true"/, 'up is selected');
  assert.match(up, /\sdisabled(=""|\s|>)/, 'the selected thumb cannot be pressed again');
  assert.match(up, /text-emerald-700/, 'and wears its active style');
  assert.match(down, /title="ต้องปรับปรุง"/);
  assert.match(down, /aria-pressed="false"/);
  assert.doesNotMatch(down, /\sdisabled(=""|\s|>)/, 'the OTHER thumb is still enabled — a rating can be changed');
  assert.match(html, /data-chat-rating="up"/);
});

test('and the mirror: rated "down" selects the down thumb and leaves up enabled', () => {
  const html = render([USER, assistant({ serverMessageId: UUID, rating: 'down' })]);
  const [up, down] = thumbs(html);
  assert.match(down, /aria-pressed="true"/);
  assert.match(down, /\sdisabled(=""|\s|>)/);
  assert.match(up, /aria-pressed="false"/);
  assert.doesNotMatch(up, /\sdisabled(=""|\s|>)/);
});

test('the panel holds no rating state of its own — it reads the message', () => {
  // Two bubbles with different ratings render independently from the store,
  // which a component-local map keyed by id could not have restored on mount.
  const html = render([
    USER,
    assistant({ id: 'a1', serverMessageId: UUID, rating: 'up' }),
    { ...USER, id: 'u2' },
    assistant({ id: 'a2', serverMessageId: 'a'.repeat(36), rating: null }),
  ]);
  assert.equal(thumbs(html).length, 4);
  assert.match(html, /data-chat-rating="up"/);
  assert.match(html, /data-chat-rating="none"/);
});

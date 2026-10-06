import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateConsentStatsBody,
  incrementsFor,
  bangkokDate,
  normaliseStatsHost,
  isSameSiteOrigin,
  acceptanceRate,
  sumCounters,
} from '@/lib/consentStats';

/**
 * CB-C §4: the consent-choice counters' pure rules — what /api/consent-stats
 * accepts, what it increments, and how the admin page computes the rate.
 */

const ok = (body) => validateConsentStatsBody(body).ok;

test('the four valid shapes are accepted', () => {
  assert.equal(ok({ choice: 'accept_all', analytics: true, marketing: true, layer: 1 }), true);
  assert.equal(ok({ choice: 'reject_all', analytics: false, marketing: false, layer: 1 }), true);
  assert.equal(ok({ choice: 'accept_all', analytics: true, marketing: true, layer: 2 }), true);
  assert.equal(ok({ choice: 'custom', analytics: true, marketing: false, layer: 2 }), true);
  assert.equal(ok({ choice: 'custom', analytics: false, marketing: false, layer: 2 }), true);
});

test('anything else is rejected', () => {
  const bad = [
    null, [], 'x', 42,
    {},
    { choice: 'accept_all', analytics: true, marketing: true },                       // missing layer
    { choice: 'accept_all', analytics: true, marketing: true, layer: 1, id: 'abc' },  // extra key
    { choice: 'accept_all', analytics: true, marketing: true, layer: 1, ua: 'x' },
    { choice: 'maybe', analytics: true, marketing: true, layer: 1 },
    { choice: 'accept_all', analytics: 'true', marketing: true, layer: 1 },           // string boolean
    { choice: 'accept_all', analytics: true, marketing: 1, layer: 1 },
    { choice: 'accept_all', analytics: true, marketing: true, layer: 3 },
    { choice: 'accept_all', analytics: true, marketing: true, layer: '1' },
    { choice: 'accept_all', analytics: true, marketing: false, layer: 1 },            // inconsistent
    { choice: 'reject_all', analytics: true, marketing: false, layer: 1 },
    { choice: 'custom', analytics: true, marketing: false, layer: 1 },                // custom only from layer 2
  ];
  for (const b of bad) assert.equal(ok(b), false, JSON.stringify(b));
});

test('increments: one counter per fact, custom splits, layer 2 is tracked', () => {
  assert.deepEqual(incrementsFor({ choice: 'accept_all', analytics: true, marketing: true, layer: 1 }),
    { decisions: 1, accept_all: 1, analytics_granted: 1, marketing_granted: 1 });
  assert.deepEqual(incrementsFor({ choice: 'reject_all', analytics: false, marketing: false, layer: 2 }),
    { decisions: 1, reject_all: 1, via_layer2: 1 });
  assert.deepEqual(incrementsFor({ choice: 'custom', analytics: true, marketing: false, layer: 2 }),
    { decisions: 1, custom: 1, analytics_granted: 1, custom_analytics: 1, via_layer2: 1 });
});

test('date is the UTC+7 calendar day', () => {
  assert.equal(bangkokDate(Date.UTC(2026, 9, 5, 16, 59)), '2026-10-05'); // 23:59 Bangkok
  assert.equal(bangkokDate(Date.UTC(2026, 9, 5, 17, 0)), '2026-10-06');  // 00:00 Bangkok
});

test('host normalisation and the same-site origin guard', () => {
  assert.equal(normaliseStatsHost('WWW.9ExpertTraining.com'), 'www.9experttraining.com');
  assert.equal(normaliseStatsHost('localhost:3000'), 'localhost:3000');
  assert.equal(normaliseStatsHost('a.com, b.com'), 'a.com');
  assert.equal(normaliseStatsHost('evil.com/path'), '');
  assert.equal(normaliseStatsHost(''), '');
  assert.equal(isSameSiteOrigin('https://www.9experttraining.com', 'www.9experttraining.com'), true);
  assert.equal(isSameSiteOrigin('https://evil.example', 'www.9experttraining.com'), false);
  assert.equal(isSameSiteOrigin(null, 'www.9experttraining.com'), false);
  assert.equal(isSameSiteOrigin('not a url', 'www.9experttraining.com'), false);
});

test('acceptance rate = (accept_all + custom with analytics) / all decisions; null without data', () => {
  assert.equal(acceptanceRate({ accept_all: 6, reject_all: 3, custom: 1, custom_analytics: 1 }), 0.7);
  assert.equal(acceptanceRate({ accept_all: 0, reject_all: 4, custom: 0 }), 0);
  assert.equal(acceptanceRate({}), null);
  const t = sumCounters([{ accept_all: 2, decisions: 2 }, { reject_all: 1, decisions: 1 }, null]);
  assert.equal(t.accept_all, 2);
  assert.equal(t.decisions, 3);
  assert.equal(t.custom, 0);
});

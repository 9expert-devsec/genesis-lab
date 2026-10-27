import { test } from 'node:test';
import assert from 'node:assert/strict';
import { organizationsCount, trustedOrganizationsHeading } from '@/lib/about/aboutProof';
import { statParts, formatParts } from '@/lib/stats/formatStat';

/**
 * /about-us Proof: the client-logo heading's number comes from the same
 * `organizations` stat as the card's "5K+". See src/lib/about/aboutProof.js.
 */

test('the heading number is organizations floored to thousands, Thai separators', () => {
  assert.equal(trustedOrganizationsHeading(5000), 'องค์กรชั้นนำกว่า 5,000 แห่งไว้วางใจ 9Expert');
  assert.equal(organizationsCount(5999), '5,000');
  assert.equal(organizationsCount(12400), '12,000');
  assert.equal(organizationsCount(999), '999');
  // and it agrees with the card: same thousands as the "K+" figure
  for (const n of [1000, 5000, 5999, 12400]) {
    const card = formatParts(statParts(n)); // "5K+"
    assert.equal(card, `${organizationsCount(n).split(',')[0]}K+`);
  }
});

test('no usable number → the heading without one, never "0"', () => {
  for (const bad of [null, undefined, '', 0, -1, 'abc']) {
    assert.equal(organizationsCount(bad), null, String(bad));
    assert.equal(trustedOrganizationsHeading(bad), 'องค์กรชั้นนำไว้วางใจ 9Expert');
  }
});

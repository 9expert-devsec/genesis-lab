import shopSummaryBoss from './shop-summary-boss.json';

/**
 * Levels no tier lists and no route serves. The shop-summary boss (IF) was the
 * Beginner boss before the re-tier; it is kept as data, still graded by the
 * level tests, in case it returns. Being here is what makes it unreachable:
 * tiers.js does not read this file.
 */
export const RETIRED_SHOP_SUMMARY_BOSS = shopSummaryBoss;

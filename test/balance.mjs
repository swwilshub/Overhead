// Target bands for the 24-month balance test (test/long.mjs). Keep in step with docs/design/balance.md.
export const BANDS = {
  earlyFloor: 0.5,      // net worth stays above half the starting money for the first six months
  endMin: 2.5,          // after 24 months the business is worth at least this many times the start...
  endMax: 18,           // ...and at most this many (no runaway money)
  salesGrowth: 1.4,     // monthly sales in months 19-24 are at least this many times months 4-9
  maxMonthlyGain: 1.3,  // no single month adds more than this multiple of the starting money
  price: [0.6, 1.55],   // every market price stays within this band of the item's base unit price
};

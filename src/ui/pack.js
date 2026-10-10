// Greedy packing for the pager, kept free of the DOM so Node can test it.
// Greedy packing: heights in pixels (each including the gap after it) into pages of at most `avail`. A unit taller than a page gets a
// page of its own. Always returns at least one (possibly empty) page.
export function pack(heights, avail) {
  const pages = []; let cur = [], used = 0;
  heights.forEach((hgt, i) => {
    if (cur.length && used + hgt > avail + 0.5) { pages.push(cur); cur = []; used = 0; }
    cur.push(i); used += hgt;
  });
  if (cur.length) pages.push(cur);
  return pages.length ? pages : [[]];
}

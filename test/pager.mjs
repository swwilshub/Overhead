// The packing behind the pager: greedy pages, oversized units, empty, stable.
import { ok, done } from './lib.mjs';
import { pack } from '../src/ui/pack.js';
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

ok(eq(pack([100, 100, 100], 250), [[0, 1], [2]]), 'units are packed in order until a page is full');
ok(eq(pack([100, 100, 100], 300), [[0, 1, 2]]), 'a page can be filled exactly');
ok(eq(pack([100, 100, 100], 299.4), [[0, 1], [2]]), 'a fraction over starts a new page');
ok(eq(pack([100, 100, 100], 299.6), [[0, 1, 2]]), 'half a pixel of slack is allowed');
ok(eq(pack([500, 50, 50], 200), [[0], [1, 2]]), 'a unit taller than a page gets a page of its own');
ok(eq(pack([50, 500, 50], 200), [[0], [1], [2]]), 'and the units around it are not squeezed in');
ok(eq(pack([], 200), [[]]), 'nothing to show is one empty page');
ok(eq(pack([30], 0), [[0]]), 'no room at all still shows the unit once');
ok(pack(Array(40).fill(70), 600).length === 5 && pack(Array(40).fill(70), 600)[0].length === 8, 'forty rows of 70 px in 600 px make five pages of eight');
ok(eq(pack([100, 100, 100], 250), pack([100, 100, 100], 250)), 'the same sizes give the same pages');
done('pager');

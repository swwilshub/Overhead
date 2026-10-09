// Seniority (specs 010 and 011): the ladders in the data, experience and promotion, what learning does to skill and pay,
// and who answers an advert.
import * as G from '../src/sim/game.js';
import { inputPorts, ZONE } from '../src/sim/floor.js';
import { RECIPES, ECONOMY, JOB_FAMILIES } from '../src/gen/data.js';
import { JOBS, JOB_LIST, ladder, jobAt, levelOf, hasRole, jobFor, AD_TARGETS, LEVEL_NAME } from '../src/core/content.js';
import { makeCandidate, xpFloor, levelProgress, growthFor, payRatio, marketSalary } from '../src/sim/people.js';
import { ok, done, setup, hire, isMaterial } from './lib.mjs';

// ---- the ladders in the data
ok(JOB_FAMILIES.length === 7, `seven families: ${JOB_FAMILIES.map(f => f.key).join(', ')}`);
for (const f of JOB_FAMILIES) {
  const rungs = ladder(f.key);
  ok(rungs.length === 3 && rungs.every((j, i) => j.level === i + 1 && j.key === `${f.key}_${i + 1}`), `${f.name} has three levels: ${rungs.map(j => j.title).join(', ')}`);
  ok(rungs[0].next === `${f.key}_2` && rungs[1].next === `${f.key}_3` && rungs[2].next === null, `${f.name}: each level links to the next, and the Director to nothing`);
  ok(rungs[0].pay < rungs[1].pay && rungs[1].pay < rungs[2].pay, `${f.name}: pay rises with each level (${rungs.map(j => j.pay).join(', ')})`);
  ok(rungs.every(j => j.dept === f.dept), `${f.name}: all three levels are in the ${f.dept} department`);
}
ok(JOB_LIST.length === 22 && JOBS.director && !JOBS.director.family && levelOf({ job: 'director' }) === 0, 'twenty-one laddered jobs and an unladdered Plant Director');
ok(JOBS.operations_3.roles.includes('foreman') && JOBS.finance_3.lead && JOBS.sales_3.roles.includes('marketing') && JOBS.engineering_3.roles.includes('research_lead') && JOBS.engineering_3.collar === 'blue', 'Directors supervise or lead as the old manager jobs did');
ok(hasRole({ job: 'operations_2' }, 'operator') && hasRole({ job: 'maintenance_3' }, 'maintenance') && hasRole({ job: 'purchasing_2' }, 'purchasing'), 'every level keeps its family role');
ok(jobFor('operator').key === 'operations_1' && jobFor('finance').key === 'finance_1' && jobFor('foreman').key === 'operations_3', 'the job to suggest for a role is the Junior one');
ok(AD_TARGETS.length === 8 && AD_TARGETS.at(-1).key === 'director', 'an advert can be placed for each family and the Plant Director');
ok(xpFloor(1) === 0 && xpFloor(2) === ECONOMY.seniority.xpToSenior && xpFloor(3) === ECONOMY.seniority.xpToDirector, 'experience thresholds come from the economy data');

// ---- experience, promotion and what learning does
const SEN = ECONOMY.seniority;
function plant(seed) {
  const st = setup(seed, { sandbox: false, sqft: 30000 });
  const r = RECIPES.find(r => r.start && r.inputs.every(([i]) => isMaterial(i)));
  const o = G.placeEquipment(st, { kind: 'machine', family: r.family, x: 4, y: 4, rot: 0, recipe: r.id }).obj;
  for (const [x, y] of inputPorts(o)) st.floor.zones[y * st.floor.w + x] = ZONE.SAFETY;
  return { st, o };
}
{
  const { st, o } = plant('sen1');
  const e = hire(st, 'operator'); G.assign(st, e.id, o.id);
  const idle = hire(st, 'operator');                      // no machine: no post, no learning
  const rec = []; let last = e.job, ratio0 = payRatio(st, e);
  G.purchaseAll(st);
  for (let d = 1; d <= 1000; d++) {
    G.advance(st, 1440); if (d % 7 === 4) { st.bank.checking += 20000; G.purchaseAll(st); }
    if (e.job !== last) { rec.push({ d, from: last, to: e.job, xp: e.xp, ratio: payRatio(st, e), growth: e.growth }); last = e.job; }
  }
  ok(e.job === 'operations_3' && rec.length === 2 && rec[0].to === 'operations_2' && rec[1].to === 'operations_3', `a working operator climbs Junior, Senior, Director, once each: ${rec.map(r => `${r.to} on day ${r.d}`).join(', ')}`);
  ok(rec[0].xp >= SEN.xpToSenior && rec[0].xp < SEN.xpToSenior + 2 && rec[1].xp >= SEN.xpToDirector && rec[1].xp < SEN.xpToDirector + 2, `promotion happens when experience reaches the threshold (${rec.map(r => r.xp.toFixed(1)).join(', ')})`);
  ok(rec[0].d > 150 && rec[0].d < 260 && rec[1].d > 550 && rec[1].d < 950, `at a pace of about six and twenty-five months of steady work (days ${rec.map(r => r.d).join(', ')})`);
  ok(rec.every(r => Math.abs(r.ratio - ratio0) < 0.03), `pay keeps its place on the city's scale through a promotion (${ratio0.toFixed(2)} -> ${rec.map(r => r.ratio.toFixed(2)).join(', ')})`);
  ok(Math.abs(rec[0].growth - growthFor(2, levelProgress({ job: 'operations_2', xp: rec[0].xp }))) < 0.01 && e.growth > rec[0].growth && e.growth <= growthFor(3, 1) + 1e-9, `learning shows in skill: growth ${rec[0].growth.toFixed(3)} at Senior, ${e.growth.toFixed(3)} as Director`);
  const memos = st.memos.filter(m => m.from === 'Personnel' && / is now an? /.test(m.subject));
  ok(memos.length >= 1 && memos.every(m => !m.important) && /is now an Operations Director/.test(memos[memos.length - 1].subject), `each promotion sends a quiet memo (the Senior one has aged out of the inbox by day ${rec[1].d}): ${memos.map(m => m.subject).reverse().join(' / ')}`);
  ok(idle.job === 'operations_1' && idle.xp === 0, `someone with no post learns nothing (${idle.job}, ${idle.xp})`);
  ok(JOBS[e.job].title === 'Operations Director' && e.salary > marketSalary(st, 'operations_1'), `the Director is paid as a Director (${e.salary})`);
  const top = e.xp, before = memos.length; G.advance(st, 30 * 1440);
  ok(e.job === 'operations_3' && st.memos.filter(m => m.from === 'Personnel' && / is now an? /.test(m.subject)).length <= before && e.xp >= top, 'a Director stays a Director and no more memos are sent');
}
{
  // the Plant Director never climbs
  const st = setup('sen2'); const d = hire(st, 'chief'); const x0 = d.xp;
  G.advance(st, 60 * 1440);
  ok(d.job === 'director' && d.xp === x0, 'the Plant Director does not climb');
}
{
  // someone hired as a Senior starts with a Senior's experience, and learns on from there
  const st = setup('sen3');
  const c = makeCandidate(st, 'finance_2'); const m = G.memo(st, { from: 'x', subject: 'r', kind: 'resume', data: { cand: c, expires: st.time + 1e7 } });
  const r = G.makeOffer(st, m.id, c.ask * 1.1);
  ok(r.ok && r.emp.job === 'finance_2' && r.emp.xp === xpFloor(2) && Math.abs(r.emp.growth - growthFor(2, 0)) < 1e-9, `a Senior hire starts at Senior with ${r.emp?.xp} experience`);
}

// ---- who answers an advert
{
  const st = setup('sen4'); const before = st.bank.checking;
  const r1 = G.placeAd(st, 'operations'), r2 = G.placeAd(st, 'operations'), r3 = G.placeAd(st, 'finance'), r4 = G.placeAd(st, 'director'), r5 = G.placeAd(st, 'nonsense');
  ok(r1.ok && !r2.ok && /already running/.test(r2.msg) && r3.ok && r4.ok && !r5.ok, 'one advert per family at a time; the Plant Director and a bad name');
  ok(Math.round(before - st.bank.checking) === ECONOMY.seniority.adCost * 2 + ECONOMY.seniority.directorAdCost, `an advert costs ${ECONOMY.seniority.adCost} ($${ECONOMY.seniority.directorAdCost} for the Plant Director)`);
  ok(st.ads.every(a => a.family && !a.job), 'adverts are kept by family');
  let seen = { 1: 0, 2: 0, 3: 0 }; const N = 4000;
  for (let i = 0; i < N; i++) seen[levelOf({ job: G.applicantJob(st, 'sales') })]++;
  const want = ECONOMY.seniority.resumeLevels;
  ok([1, 2, 3].every(l => Math.abs(seen[l] / N - want[l - 1]) < 0.03), `applicants are mostly Juniors, sometimes Seniors, rarely Directors (${[1, 2, 3].map(l => (seen[l] / N * 100).toFixed(0)).join(' / ')} percent)`);
  ok(G.applicantJob(st, 'director') === 'director', 'an advert for the Plant Director draws Plant Director applicants');
  // resumes really arrive, at every level, and a more senior applicant asks for more
  const st2 = setup('sen5');
  for (let w = 0; w < 120; w++) { G.placeAd(st2, 'purchasing'); G.advance(st2, 7 * 1440); }
  const levels = new Set(st2.memos.filter(m => m.kind === 'resume').map(m => levelOf(m.data.cand)));
  ok(levels.has(1) && levels.has(2), `resumes arrive at more than one level (${[...levels].sort().join(', ')})`);
  const avg = k => { let t = 0; for (let i = 0; i < 300; i++) t += makeCandidate(st, k).ask; return t / 300; };
  ok(avg('sales_1') < avg('sales_2') && avg('sales_2') < avg('sales_3'), `a more senior applicant asks for more (${[1, 2, 3].map(l => Math.round(avg('sales_' + l))).join(' < ')})`);
  const yrs = k => { let t = 0; for (let i = 0; i < 300; i++) t += makeCandidate(st, k).years; return t / 300; };
  ok(yrs('finance_1') < yrs('finance_3'), 'and has more years behind them');
}
ok(LEVEL_NAME.join() === ',Junior,Senior,Director', 'the three levels are called Junior, Senior and Director');
done('seniority');

// Employees and applicants: traits, job fit, pay expectations, daily schedules, morale.
import { ATTRS, NEGATIVE_ATTRS, JOBS, JOB_LIST, FIRST_M, FIRST_F, LAST, FIRM_PREFIX, FIRM_SUFFIX } from '../core/content.js';
import { ECONOMY } from '../gen/data.js';
import { rand, randInt, pick, chance, clamp, gauss } from '../core/util.js';

export const WORK_START = 8 * 60, WORK_END = 17 * 60, LUNCH = 12 * 60;

export function jobFit(attrs, jobKey) {
  const w = JOBS[jobKey].w; let s = 0, tw = 0;
  for (const [k, wt] of Object.entries(w)) { const v = attrs[ATTRS.indexOf(k)]; s += wt * (NEGATIVE_ATTRS.has(k) ? 100 - v : v); tw += wt; }
  return clamp(s / tw / 100, 0, 1);
}
export function marketSalary(st, jobKey) { return Math.round(st.city.avgSalary * JOBS[jobKey].pay / 100) * 100; }

export function makeCandidate(st, jobKey) {
  const female = chance(st, 0.5);
  const attrs = ATTRS.map(() => clamp(Math.round(gauss(st, 50, 17)), 3, 99));
  // applicants who answer an ad usually have some background in the field
  const bias = rand(st, -6, 26) + st.city.f * 3;
  for (const k of Object.keys(JOBS[jobKey].w)) { const i = ATTRS.indexOf(k); attrs[i] = clamp(Math.round(attrs[i] + (NEGATIVE_ATTRS.has(k) ? -bias : bias)), 3, 99); }
  const fit = jobFit(attrs, jobKey);
  const years = clamp(Math.round(gauss(st, st.city.experience / 12 + 4, 4)), 0, 35);
  const age = clamp(19 + years + randInt(st, 0, 14), 19, 66);
  const ask = Math.round(marketSalary(st, jobKey) * (0.82 + fit * 0.38 + Math.min(years, 20) * 0.006) * rand(st, 0.95, 1.06) / 500) * 500;
  const history = [];
  let y = ECONOMY.startYear - 1, left = years;
  while (left > 0 && history.length < 3) {
    const span = Math.min(left, randInt(st, 1, 7));
    const title = chance(st, 0.7) ? JOBS[jobKey].title : pick(st, JOB_LIST).title;
    history.push(`${y - span}–${y}: ${title}, ${pick(st, FIRM_PREFIX)} ${pick(st, FIRM_SUFFIX)}`);
    y -= span; left -= span;
  }
  return {
    first: pick(st, female ? FIRST_F : FIRST_M), last: pick(st, LAST), female, age, years,
    attrs, job: jobKey, ask, history,
    fitEstimate: clamp(Math.round((fit + gauss(st, 0, 0.05)) * 100), 1, 99),
  };
}

export function hire(st, cand, salary) {
  const e = {
    id: st.nextId++, first: cand.first, last: cand.last, female: cand.female, age: cand.age, years: cand.years,
    attrs: cand.attrs, job: cand.job, salary, hired: st.time, lastReview: st.time, lastRaise: st.time,
    morale: 62, stress: 12, growth: 0, assign: null, injuredUntil: 0, log: [], schedule: null, x: null, y: null,
    accruedDays: 0,
  };
  st.employees.push(e);
  return e;
}

export function skill(e) { return clamp(jobFit(e.attrs, e.job) + e.growth, 0, 1); }
export function payRatio(st, e) { return e.salary / marketSalary(st, e.job); }
export function fullName(e) { return `${e.first} ${e.last}`; }
export const isWhite = e => JOBS[e.job].collar === 'white';

// A day plan: list of {from,to,act} minute ranges. Activities: work, coffee, smoke, restroom, lunch, home, walk.
export function planDay(st, e, hasSmokingZone) {
  const A = k => e.attrs[ATTRS.indexOf(k)];
  const late = Math.max(0, Math.round(gauss(st, (60 - A('timekeeping')) / 6, 4)));
  const start = WORK_START + late, end = WORK_END - (chance(st, (60 - A('diligence')) / 400) ? randInt(st, 10, 40) : 0);
  const breaks = [];
  const add = (act, n, len) => { for (let i = 0; i < n; i++) { const t = randInt(st, start + 30, end - 40); breaks.push({ from: t, to: t + len, act }); } };
  add('coffee', A('coffee') > 70 ? 2 : A('coffee') > 40 ? 1 : 0, 10);
  if (A('smoker') > 62) add('smoke', A('smoker') > 82 ? 3 : 2, hasSmokingZone ? 9 : 18);
  add('restroom', chance(st, 0.6) ? 2 : 1, 6);
  if (chance(st, (55 - A('diligence')) / 300)) add('goof', 1, randInt(st, 10, 30));
  breaks.push({ from: LUNCH, to: LUNCH + 45, act: 'lunch' });
  breaks.sort((a, b) => a.from - b.from);
  const out = []; let t = start;
  for (const b of breaks) {
    if (b.from < t) continue;
    if (b.from > t) out.push({ from: t, to: b.from, act: 'work' });
    out.push(b); t = b.to;
  }
  if (t < end) out.push({ from: t, to: end, act: 'work' });
  return out;
}

export function activityAt(e, minute) {
  if (!e.schedule) return 'home';
  for (const s of e.schedule) if (minute >= s.from && minute < s.to) return s.act;
  return 'home';
}
export const ACT_LABEL = { work: 'Working', coffee: 'Coffee break', smoke: 'Smoking', restroom: 'Restroom', lunch: 'Eating lunch', goof: 'Goofing off', home: 'Off duty', strike: 'On strike', injured: 'Recovering at home', idle: 'Waiting for an assignment' };

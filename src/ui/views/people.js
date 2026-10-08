import { h, table, kv, announce, dialog, confirmBox, pill, meter, field } from '../dom.js';
import { app, go, render as rerender, act } from '../app.js';
import * as G from '../../sim/game.js';
import { JOBS, JOB_LIST, deptName, hasRole, ATTR_GROUPS, ATTRS, NEGATIVE_ATTRS } from '../../core/content.js';
import { ECONOMY } from '../../gen/data.js';
const RAISE = () => Math.round(ECONOMY.walkoutRaise * 100);
import { fullName, skill, payRatio, marketSalary, jobFit, activityAt, ACT_LABEL, isWhite } from '../../sim/people.js';
import { objectLabel } from '../../sim/floor.js';
import { money, num, pct, fmtDate, fmtShortDate, minuteOfDay, MIN_PER_DAY } from '../../core/util.js';

const statusOf = (st, e) => ACT_LABEL[e.state || activityAt(e, minuteOfDay(st.time))] || '—';
const moodPill = v => v >= 65 ? pill(`${Math.round(v)} good`, 'ok') : v >= 40 ? pill(`${Math.round(v)} fair`, 'warn') : pill(`${Math.round(v)} poor`, 'bad');
const stressPill = v => v >= 80 ? pill(`${Math.round(v)} severe`, 'bad') : v >= 50 ? pill(`${Math.round(v)} high`, 'warn') : pill(`${Math.round(v)} ok`, 'ok');

// ================= Staff
export const staff = {
  live: true,
  render() {
    const st = app.st, vs = (app.viewState.staff ||= { sort: { key: 'dept', dir: 1 } });
    const rows = st.employees.map(e => ({ e, name: fullName(e), title: JOBS[e.job].title, dept: JOBS[e.job].dept, salary: e.salary, ratio: payRatio(st, e), fit: skill(e), morale: e.morale, stress: e.stress, where: e.assign ? objectLabel(st, st.floor.objects.find(o => o.id === e.assign) || { kind: '?' }) : '—' }));
    const payroll = st.employees.reduce((s, e) => s + e.salary, 0);
    return h('div', { class: 'stack' },
      h('div', { class: 'view-head' }, h('div', null, h('h1', null, 'Staff'), h('p', null, `${num(st.employees.length)} employees · payroll ${money(payroll)} a year, paid every other Friday.`)), h('button', { type: 'button', class: 'primary', onclick: () => go('hire') }, 'Hire people')),
      st.strike ? h('div', { class: 'notice', role: 'alert' }, h('p', null, h('strong', null, 'The floor crew has walked out. '), `They want a ${RAISE()}% raise, and no machine runs until it's settled.`), h('button', { type: 'button', class: 'primary', style: { marginTop: '8px' }, onclick: async () => { if (await confirmBox('End the walkout?', `Give everyone on the floor a ${RAISE()}% raise?`, 'Give the raise')) act(G.settleStrike(st)); } }, `Give the ${RAISE()}% raise`)) : null,
      deptSummary(st),
      h('section', { class: 'card' }, h('h2', null, 'Employees'),
        table('Employees', [
          { key: 'name', label: 'Name', render: r => h('button', { class: 'link', type: 'button', 'data-key': 'emp-' + r.e.id, onclick: () => profile(r.e.id) }, r.name) },
          { key: 'title', label: 'Job' }, { key: 'dept', label: 'Department', render: r => deptName(r.dept) },
          { key: 'where', label: 'Workplace' },
          { key: 'status', label: 'Now', render: r => statusOf(st, r.e), sortable: false },
          { key: 'salary', label: 'Salary', num: true, render: r => money(r.salary) },
          { key: 'ratio', label: 'vs city avg', num: true, render: r => h('span', { class: r.ratio < 0.92 ? 'bad' : r.ratio > 1.08 ? 'good' : '' }, pct(r.ratio)) },
          { key: 'fit', label: 'Skill', num: true, render: r => pct(r.fit) },
          { key: 'morale', label: 'Morale', render: r => moodPill(r.morale) },
          { key: 'stress', label: 'Stress', render: r => stressPill(r.stress) }],
        rows, { sortState: vs.sort, onSort: s => { vs.sort = s; rerender({}); }, empty: 'No employees yet. Place a help-wanted ad on the Hiring page.' })));
  },
};
function deptSummary(st) {
  const d = st.dept, delay = G.accountingDelay(st);
  const items = [
    ['Finance', st.employees.some(e => hasRole(e, 'finance')) ? (delay > 2 ? pill(`${delay} days behind`, 'warn') : pill('Up to date', 'ok')) : pill('No staff: bills paid late', 'bad')],
    ['Supply', st.employees.some(e => hasRole(e, 'purchasing')) ? pill(`Can place about ${Math.max(1, Math.round(d.purchCap))} orders a day`, 'ok') : pill('No staff: you place every order', 'warn')],
    ['Sales effort', h('span', null, meter(d.salesEff / 3, 'Sales effort'), ' ', d.salesEff < 0.5 ? 'Walk-in customers only' : d.salesEff < 1.2 ? 'Modest' : 'Strong')],
    ['Brand awareness', h('span', null, meter(d.awareness, 'Brand awareness'), ' ', pct(d.awareness))],
  ];
  return h('section', { class: 'card' }, h('h2', null, 'Departments'), kv(items));
}

export async function profile(empId) {
  const st = app.st, e = st.employees.find(x => x.id === empId); if (!e) return;
  const traits = h('div', { class: 'grid2', style: { gap: '10px 20px' } }, ATTR_GROUPS.map(([g, list]) => h('div', null, h('h3', { style: { fontSize: '1rem' } }, g),
    h('ul', { style: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '4px' } }, list.map(([k, label]) => { const v = e.attrs[ATTRS.indexOf(k)]; return h('li', { class: 'row', style: { flexWrap: 'nowrap', justifyContent: 'space-between' } }, h('span', null, label, NEGATIVE_ATTRS.has(k) ? h('span', { class: 'muted' }, ' (lower is better)') : ''), h('span', { class: 'row', style: { flexWrap: 'nowrap' } }, meter(v / 100, `${label} ${v} of 100`), h('span', { class: 'num', style: { width: '2.4em', textAlign: 'right' } }, v))); })))));
  const raise = h('select', { id: 'rev-raise' }, [0, 2, 3, 5, 8, 10, 15].map(p => h('option', { value: p }, p ? `${p}% raise (${money(Math.round(e.salary * (1 + p / 100) / 100) * 100)})` : 'No raise')));
  const fits = JOB_LIST.map(j => ({ j, f: jobFit(e.attrs, j.key) })).sort((a, b) => b.f - a.f).slice(0, 3);
  const body = h('div', { class: 'stack' },
    kv([['Job', `${JOBS[e.job].title}, ${deptName(JOBS[e.job].dept)}`], ['Age', `${e.age}`], ['Hired', fmtDate(e.hired)], ['Salary', `${money(e.salary)} (city average for this job ${money(marketSalary(st, e.job))})`], ['Skill at this job', pct(skill(e))], ['Morale', Math.round(e.morale) + ' / 100'], ['Stress', Math.round(e.stress) + ' / 100'], ['Last review', fmtShortDate(e.lastReview)], ['Best suited for', fits.map(x => `${x.j.title} (${pct(x.f)})`).join(', ')]]),
    traits,
    h('div', { class: 'row', style: { alignItems: 'end' } }, field('Performance review', raise, 'People like reviews that come with a raise.'), h('button', { type: 'button', onclick: () => { act(G.review(st, e.id, +raise.value), false, +raise.value ? 'cash' : 'ok'); } }, 'Give review')));
  const r = await dialog(`${fullName(e)}`, body, [{ label: 'Terminate…', value: 'fire', danger: true }, { label: 'Close', value: null, primary: true }], { wide: true });
  if (r === 'fire' && await confirmBox(`Let ${fullName(e)} go?`, `They receive two weeks of severance (${money(Math.round(e.salary / 26))}). Coworkers' morale dips a little.`, 'Terminate', true)) act(G.terminate(st, e.id));
}

// ================= Hiring
export const hire = {
  live: true,
  render() {
    const st = app.st;
    const resumes = st.memos.filter(m => m.kind === 'resume' && !m.data.hired && !m.data.gone);
    return h('div', { class: 'stack' },
      h('div', { class: 'view-head' }, h('div', null, h('h1', null, 'Hiring'), h('p', null, 'Place a help-wanted ad. Resumes arrive in the In-basket over the next week; make an offer to hire.'))),
      h('section', { class: 'card' }, h('h2', null, `Resumes on file (${resumes.length})`), resumeTable(st, resumes)),
      h('section', { class: 'card' }, h('h2', null, 'Help-wanted ads'),
        table('Job titles', [
          { key: 'title', label: 'Job' },
          { key: 'dept', label: 'Department', render: j => deptName(j.dept) },
          { key: 'collar', label: 'Works in', render: j => j.collar === 'white' ? 'Office' : 'Factory floor' },
          { key: 'pay', label: 'City average pay', num: true, render: j => money(marketSalary(st, j.key)), sort: j => j.pay },
          { key: 'have', label: 'On staff', num: true, render: j => num(st.employees.filter(e => e.job === j.key).length), sort: j => st.employees.filter(e => e.job === j.key).length },
          { key: 'desc', label: 'Duties', render: j => j.desc, sortable: false },
          { key: 'ad', label: 'Ad', sortable: false, render: j => { const ad = st.ads.find(a => a.job === j.key && a.until > st.time); return ad ? pill(`Running until ${fmtShortDate(ad.until)}`, 'info') : h('button', { type: 'button', 'data-key': 'ad-' + j.key, onclick: () => act(G.placeAd(st, j.key), false, 'order') }, `Place ad (${money(j.lead ? 550 : 300)})`); } }],
        JOB_LIST, { hideCaption: true })));
  },
};
function resumeTable(st, resumes) {
  return table('Resumes', [
    { key: 'name', label: 'Applicant', render: m => h('button', { class: 'link', type: 'button', 'data-key': 'res-' + m.id, onclick: () => openResume(m.id) }, `${m.data.cand.first} ${m.data.cand.last}`) },
    { key: 'job', label: 'Position', render: m => JOBS[m.data.cand.job].title, sort: m => JOBS[m.data.cand.job].id },
    { key: 'fit', label: 'Est. job fit', num: true, render: m => m.data.cand.fitEstimate + '%', sort: m => m.data.cand.fitEstimate },
    { key: 'ask', label: 'Asking', num: true, render: m => money(m.data.cand.ask), sort: m => m.data.cand.ask },
    { key: 'yrs', label: 'Experience', num: true, render: m => `${m.data.cand.years} yr`, sort: m => m.data.cand.years },
    { key: 'exp', label: 'Expires', render: m => fmtShortDate(m.data.expires), sortable: false },
    { key: 'go', label: '', sortable: false, render: m => h('button', { type: 'button', onclick: () => openResume(m.id) }, 'Review and offer') }],
    resumes, { hideCaption: true, empty: 'No resumes waiting. Place an ad below.', defaultSort: 'fit', defaultDir: -1 });
}

export async function openResume(memoId) {
  const st = app.st, m = st.memos.find(x => x.id === memoId); if (!m) return;
  m.read = true;
  const c = m.data.cand;
  const offer = h('input', { type: 'number', id: 'salary-offer', min: 0, step: 500, value: c.ask, inputmode: 'numeric' });
  const top = ATTR_GROUPS.flatMap(([, l]) => l).map(([k, label]) => ({ label, v: c.attrs[ATTRS.indexOf(k)], neg: NEGATIVE_ATTRS.has(k) }));
  const strengths = top.filter(t => !t.neg).sort((a, b) => b.v - a.v).slice(0, 4).map(t => t.label.toLowerCase());
  const weak = top.filter(t => !t.neg).sort((a, b) => a.v - b.v).slice(0, 2).map(t => t.label.toLowerCase());
  const habits = top.filter(t => t.neg && t.v > 65).map(t => t.label.toLowerCase());
  const body = h('div', { class: 'stack' },
    kv([['Seeking', JOBS[c.job].title], ['Desired salary', money(c.ask)], ['City average', money(marketSalary(st, c.job))], ['Estimated job fit', c.fitEstimate + '%'], ['Age', String(c.age)], ['Experience', `${c.years} years`]]),
    h('div', null, h('h3', { style: { fontSize: '1rem' } }, 'Employment history'), c.history.length ? h('ul', null, c.history.map(x => h('li', null, x))) : h('p', null, 'No previous jobs.')),
    h('p', null, `References describe ${c.female ? 'her' : 'him'} as strong in ${strengths.join(', ')}; weaker in ${weak.join(' and ')}.${habits.length ? ` Known for frequent ${habits.join(' and ')}.` : ''}`),
    m.data.hired ? h('p', { class: 'good' }, 'Hired.') : m.data.gone ? h('p', { class: 'muted' }, 'No longer available.') : field('Your offer (yearly salary)', offer, 'Offers well below the asking salary are usually turned down.'));
  const actions = m.data.hired || m.data.gone ? [{ label: 'Close', value: null, primary: true }] : [{ label: 'Close', value: null }, { label: 'Make offer', value: 'offer', primary: true, run: () => { const r = G.makeOffer(st, m.id, +offer.value); act(r, false, 'hire'); return r.ok || m.data.gone ? true : false; } }];
  await dialog(`Resume: ${c.first} ${c.last}`, body, actions, { wide: true });
  rerender({});
}

// ================= In-basket
export const inbox = {
  live: true,
  render() {
    const st = app.st, v = (app.viewState.inbox ||= { filter: 'all', open: null });
    const list = st.memos.filter(m => v.filter === 'all' || (v.filter === 'unread' && !m.read) || (v.filter === 'resumes' && m.kind === 'resume') || (v.filter === 'important' && m.important));
    const open = v.open != null ? st.memos.find(m => m.id === v.open) : null;
    const filt = h('div', { class: 'row', role: 'group', 'aria-label': 'Show' }, [['all', 'All'], ['unread', 'Unread'], ['important', 'Urgent'], ['resumes', 'Resumes']].map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(v.filter === k), 'data-key': 'if-' + k, onclick: () => { v.filter = k; rerender({}); } }, l)));
    return h('div', { class: 'stack' },
      h('div', { class: 'view-head' }, h('div', null, h('h1', null, 'In-basket'), h('p', null, `${num(st.memos.filter(m => !m.read).length)} unread of ${num(st.memos.length)} memos.`)),
        h('div', { class: 'row' }, h('button', { type: 'button', onclick: () => { st.memos.forEach(m => { m.read = true; }); act({ ok: true, msg: 'All memos marked read.' }); } }, 'Mark all read'), h('button', { type: 'button', onclick: () => { const n = st.memos.length; st.memos = st.memos.filter(m => !m.read || (m.kind === 'resume' && !m.data.hired && !m.data.gone)); act({ ok: true, msg: `Cleared ${n - st.memos.length} read memos.` }); } }, 'Clear read memos'))),
      filt,
      h('div', { class: 'grid2', style: { gridTemplateColumns: 'minmax(min(100%, 320px), 1fr) minmax(min(100%, 320px), 1.3fr)', alignItems: 'start' } },
        h('section', { class: 'card', 'aria-labelledby': 'mlist' }, h('h2', { id: 'mlist', class: 'sr-only' }, 'Memos'),
          list.length ? h('ul', { style: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '2px' } }, list.slice(0, 150).map(m => h('li', null, h('button', { type: 'button', 'data-key': 'memo-' + m.id, 'aria-current': open?.id === m.id ? 'true' : null,
            style: { width: '100%', justifyContent: 'space-between', textAlign: 'left', fontWeight: m.read ? 400 : 700, background: open?.id === m.id ? 'var(--accent-soft)' : 'var(--panel)' },
            onclick: () => { v.open = m.id; m.read = true; rerender({}); document.getElementById('memo-h')?.focus(); } },
            h('span', null, m.important ? pill('Urgent', 'bad') : null, ' ', m.subject, h('span', { class: 'muted', style: { fontWeight: 400 } }, ` — ${m.from}`), m.read ? '' : h('span', { class: 'sr-only' }, ' (unread)')),
            h('span', { class: 'muted num', style: { fontWeight: 400, fontSize: '0.8rem' } }, fmtShortDate(m.t)))))) : h('p', { class: 'empty' }, 'Nothing here.')),
        open ? memoCard(st, open) : h('section', { class: 'card' }, h('p', { class: 'muted' }, 'Choose a memo to read it.'))));
  },
};
function memoCard(st, m) {
  const actions = [];
  if (m.kind === 'resume' && !m.data.hired && !m.data.gone) actions.push(h('button', { class: 'primary', type: 'button', onclick: () => openResume(m.id) }, 'Review and make an offer'));
  if (m.kind === 'raise' && !m.data.done) actions.push(h('button', { class: 'primary', type: 'button', onclick: () => act(G.answerRaise(st, m.id, true), false, 'cash') }, `Agree to ${money(m.data.ask)}`), h('button', { type: 'button', onclick: () => act(G.answerRaise(st, m.id, false)) }, 'Say no'));
  if (m.kind === 'strike' && st.strike) actions.push(h('button', { class: 'primary', type: 'button', onclick: () => act(G.settleStrike(st)) }, `Give the ${RAISE()}% raise`));
  const body = m.kind === 'resume' ? `${m.data.cand.first} ${m.data.cand.last} is applying for ${JOBS[m.data.cand.job].title}, asking ${money(m.data.cand.ask)} a year. Estimated job fit ${m.data.cand.fitEstimate}%.${m.data.hired ? ' (Hired.)' : m.data.gone ? ' (No longer available.)' : ''}` : m.body;
  return h('section', { class: 'card stack', 'aria-labelledby': 'memo-h' },
    h('h2', { id: 'memo-h', tabindex: -1 }, m.subject),
    h('p', { class: 'muted' }, `From ${m.from} · ${fmtDate(m.t)}`),
    h('div', { class: 'memo-body' }, body),
    actions.length ? h('div', { class: 'row' }, actions) : null);
}

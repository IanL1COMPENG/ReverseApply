import { COMPANIES } from './companies.js';
import { readResumeFile, parseResume, dateParts } from './resume.js';
import { searchJobs, parseBoardLinks, loadDetail, setReaderKey } from './search.js';
import { scoreJob, scoreInternship, scoreClass } from './score.js';
import { tailorResume, resumePdf, resumeText, coverLetter, applicationAnswers } from './tailor.js';
import { pretty, spellingIn } from './skills.js';
import { TIER_LABEL } from './companies-tiers.js';
import { runPanel, aiTailor } from './ai.js';
import { suggestRoles, searchPaths, museCategories, pathsFor } from './careers.js';
import { atsReport } from './atscheck.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- storage (browser only; failures are fine) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('ra.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ra.' + k, JSON.stringify(v)); } catch { /* full or blocked */ } },
};

const state = {
  resume: store.get('resume', ''),
  parsed: null,
  profile: store.get('profile', {}),
  prefs: store.get('prefs', null),
  jobs: store.get('jobs', []),
  interns: store.get('interns', []),
  queue: store.get('queue', []),
  tracker: store.get('tracker', []),
  edits: store.get('edits', {}),     // jobId -> edited resume text
  extras: store.get('extras', {}),   // jobId -> skills the user confirmed they have
  key: store.get('key', ''),
  model: store.get('model', 'claude-sonnet-5-5'),
  readerKey: store.get('readerKey', ''),
};
setReaderKey(state.readerKey);

function toast(msg, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), ms);
}

// ---------- tabs ----------
function showTab(name) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  $$('.pane').forEach(p => p.classList.toggle('active', p.id === `pane-${name}`));
}
$$('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
document.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) showTab(g.dataset.go); });

// ---------- resume ----------
const PROFILE_FIELDS = { name: '#pName', email: '#pEmail', phone: '#pPhone', location: '#pLocation', linkedin: '#pLinkedin', site: '#pSite', auth: '#pAuth' };

function applyResume(text, fromFile) {
  const changed = text !== state.resume;
  state.resume = text;
  state.parsed = parseResume(text);
  store.set('resume', text);
  const guessed = state.parsed.profile;
  for (const [k, sel] of Object.entries(PROFILE_FIELDS)) {
    // A new file overwrites what it can detect; pasted edits only fill blanks.
    if (guessed[k] && (fromFile || !state.profile[k])) state.profile[k] = guessed[k];
    if (state.profile[k]) $(sel).value = state.profile[k];
  }
  // Graduation date: read from the resume, unless the user corrected it for this same resume.
  const detected = state.parsed.education.gradDate;
  if (detected && (changed || fromFile || !state.profile.gradManual)) { state.profile.grad = detected; state.profile.gradManual = false; }
  applyGrad();
  store.set('profile', state.profile);
  $('#skillChips').innerHTML = state.parsed.skills.map(s => `<span class="chip">${esc(pretty(s))}</span>`).join('') || '<span class="muted small">No known skills found yet. Make sure your resume has a Skills section.</span>';
  $('#skillCount').textContent = `(${state.parsed.skills.length})`;
  $('#resumeStatus').textContent = `✓ Resume loaded · ${text.split(/\s+/).length} words · about ${state.parsed.years} years of full-time work (internships, part-time and side roles not counted)${state.profile.grad ? ` · graduation: ${state.profile.grad}` : ' · no graduation date found: add it in your profile if you are a student'}`;
  const paths = pathsFor(state.parsed);
  $('#fieldBox').hidden = !paths.length;
  $('#fieldBox').innerHTML = paths.length ? `Your field: <b>${paths.map(p => esc(p.label)).join(' · ')}</b> <span class="muted">(from your major and past jobs; you can search for anything in step 2)</span>` : '';
  if (!$('#fRoles').value) $('#fRoles').value = suggestRoles(state.parsed).join(', ');
  renderRoleChips();
}

// Suggested roles for this resume's fields: click to add or remove.
function renderRoleChips() {
  if (!state.parsed) return;
  const have = splitList($('#fRoles').value).map(r => r.toLowerCase());
  const ideas = [...new Set(searchPaths(have, state.parsed).flatMap(p => p.roles))].slice(0, 14);
  $('#roleChips').innerHTML = ideas.map(r => `<button type="button" class="chip chip-btn ${have.includes(r) ? 'on' : ''}" data-role="${esc(r)}">${have.includes(r) ? '✓ ' : '+ '}${esc(r)}</button>`).join('');
  const cats = museCategories(have, state.parsed);
  $('#fieldLine').textContent = cats.length ? `Also searching the all-industry feed in: ${cats.join(', ')}` : '';
}
$('#roleChips').addEventListener('click', e => {
  const b = e.target.closest('[data-role]');
  if (!b) return;
  const list = splitList($('#fRoles').value), r = b.dataset.role;
  const i = list.findIndex(x => x.toLowerCase() === r);
  if (i >= 0) list.splice(i, 1); else list.push(r);
  $('#fRoles').value = list.join(', ');
  renderRoleChips();
});
$('#fRoles').addEventListener('change', renderRoleChips);

// The profile's graduation date is the one used for every score, summary, cover letter and answer.
function applyGrad() {
  $('#pGrad').value = state.profile.grad || '';
  if (state.parsed) Object.assign(state.parsed.education, dateParts(state.profile.grad || ''));
  // Saved tailored resumes and cover letters may carry an older graduation date: correct it in place.
  const g = state.profile.grad;
  if (!g) return;
  let fixed = false;
  for (const [k, v] of Object.entries(state.edits)) {
    const nv = v.replace(/\(graduating [^)]*\)/g, `(graduating ${g})`).replace(/, graduating in [^,]*?(?:19|20)\d{2},/g, `, graduating in ${g},`);
    if (nv !== v) { state.edits[k] = nv; fixed = true; }
  }
  if (fixed) store.set('edits', state.edits);
}
$('#pGrad').addEventListener('change', e => {
  state.profile.grad = e.target.value.trim();
  state.profile.gradManual = true;
  store.set('profile', state.profile);
  applyGrad();
  if (state.jobs.length || state.interns.length) { state.edits = {}; store.set('edits', {}); rescore(); }
  toast(dateParts(state.profile.grad).gradYear ? `Graduation date set to ${state.profile.grad}. Scores updated.` : 'Enter a date with a year, like "May 2028".');
});

const drop = $('#drop');
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });
$('#resumeFile').addEventListener('change', e => e.target.files[0] && loadFile(e.target.files[0]));

async function loadFile(file) {
  $('#resumeStatus').textContent = 'Reading…';
  try {
    const text = await readResumeFile(file);
    if (text.length < 80) throw new Error('Very little text found. If this is a scanned PDF, paste the text instead.');
    $('#resumeText').value = text;
    applyResume(text, true);
    toast('Resume loaded. Check your profile, then go to step 2.');
  } catch (e) {
    $('#resumeStatus').textContent = e.message || 'Could not read that file. Try pasting the text.';
  }
}

$('#saveResume').addEventListener('click', () => {
  const t = $('#resumeText').value.trim();
  if (t.length < 80) return toast('Paste your full resume first.');
  applyResume(t, false);
  showTab('prefs');
});
Object.entries(PROFILE_FIELDS).forEach(([k, sel]) => $(sel).addEventListener('change', e => { state.profile[k] = e.target.value; store.set('profile', state.profile); }));
// Eligibility answers change scores (citizenship, clearance, license), so re-score right away.
const ELIG_BOXES = { clearance: '#pClearance', license: '#pLicense' };
Object.entries(ELIG_BOXES).forEach(([k, sel]) => $(sel).addEventListener('change', e => { state.profile[k] = e.target.checked; store.set('profile', state.profile); refreshEligibility(); }));
$('#pAuth').addEventListener('change', () => refreshEligibility());
function refreshEligibility() {
  if (state.prefs) { Object.assign(state.prefs, eligPrefs()); store.set('prefs', state.prefs); }
  if (state.parsed && (state.jobs.length || state.interns.length)) { rescore(); toast('Scores updated for your work status.'); }
}
const eligPrefs = () => ({ auth: $('#pAuth').value, clearance: $('#pClearance').checked, license: $('#pLicense').checked });

// ---------- preferences ----------
const splitList = s => s.split(',').map(x => x.trim()).filter(Boolean);
function readPrefs() {
  const roles = splitList($('#fRoles').value);
  return {
    roles, keywords: splitList($('#fKeywords').value), exclude: splitList($('#fExclude').value),
    where: $('#fWhere').value, places: splitList($('#fPlaces').value), level: $('#fLevel').value, ageDays: +$('#fAge').value,
    useAts: $('#srcAts').checked, useRemote: $('#srcRemote').checked, useInterns: $('#srcInterns').checked, useMuse: $('#srcMuse').checked, extra: $('#extraBoards').value,
    // Career paths (from the resume and the roles typed) decide which all-industry listings count as your field.
    paths: searchPaths(roles, state.parsed).map(p => p.id), museCats: museCategories(roles, state.parsed),
    needsSponsor: /sponsor/i.test($('#pAuth').value), otherCountry: /other country/i.test($('#pAuth').value), ...eligPrefs(),
    gradStudent: !!state.parsed?.education?.gradStudent,
  };
}
function writePrefs(p) {
  $('#fRoles').value = p.roles.join(', '); $('#fKeywords').value = p.keywords.join(', '); $('#fExclude').value = p.exclude.join(', ');
  $('#fWhere').value = p.where; $('#fPlaces').value = p.places.join(', '); $('#fLevel').value = p.level; $('#fAge').value = String(p.ageDays);
  $('#srcAts').checked = p.useAts; $('#srcRemote').checked = p.useRemote; $('#srcInterns').checked = p.useInterns !== false; $('#srcMuse').checked = p.useMuse !== false; $('#extraBoards').value = p.extra || '';
  if (p.level === 'intern') $('#fLevel').value = 'auto';
  $('#fPlacesWrap').hidden = p.where !== 'custom';
}
$('#fWhere').addEventListener('change', e => ($('#fPlacesWrap').hidden = e.target.value !== 'custom'));

$('#saveKey').addEventListener('click', () => {
  state.key = $('#apiKey').value.trim(); state.model = $('#apiModel').value;
  store.set('key', state.key); store.set('model', state.model);
  $('#keyStatus').textContent = state.key ? 'Saved in this browser.' : '';
});
$('#clearKey').addEventListener('click', () => { state.key = ''; $('#apiKey').value = ''; store.set('key', ''); $('#keyStatus').textContent = 'Forgotten.'; });
$('#readerKey').addEventListener('change', e => { state.readerKey = e.target.value.trim(); store.set('readerKey', state.readerKey); setReaderKey(state.readerKey); toast(state.readerKey ? 'Reader key saved: postings will be read much faster.' : 'Reader key removed.'); });
$('#apiModel').addEventListener('change', e => { state.model = e.target.value; store.set('model', state.model); });

// ---------- search ----------
$('#runSearch').addEventListener('click', async () => {
  if (!state.parsed) return toast('Add your resume in step 1 first.') || showTab('resume');
  const prefs = readPrefs();
  if (!prefs.roles.length && !prefs.keywords.length) return toast('Tell us at least one target role.');
  state.prefs = prefs; store.set('prefs', prefs);
  showTab('jobs');
  const btn = $('#runSearch'); btn.disabled = true;
  $('#progress').hidden = false;
  const started = performance.now();
  try {
    readGen++; // stop any background reading from a previous search
    const { jobs, interns, scanned } = await searchJobs(prefs, parseBoardLinks(prefs.extra), p => {
      $('#progress div').style.width = `${(p.done / p.total) * 100}%`;
      $('#searchStatus').textContent = `${p.phase || `Searching ${p.done}/${p.total} sources`} · ${p.scanned.toLocaleString()} openings read · ${p.found} jobs and ${p.foundInterns} internships match so far`;
      $('#internStatus').textContent = $('#searchStatus').textContent;
    });
    rescore(jobs, interns);
    const secs = ((performance.now() - started) / 1000).toFixed(1);
    $('#searchStatus').textContent = `Read ${scanned.toLocaleString()} openings in ${secs}s · ${jobs.length} full-time jobs match · ${jobs.filter(j => j.fit.score >= 4).length} scored 4+ · internships are in their own tab`;
    $('#internStatus').textContent = `${interns.length} internships match your field · ${interns.filter(j => j.fit.score >= 4).length} scored 4+ for a student graduating ${state.parsed.education?.gradYear || '(add your graduation year to your resume)'}`;
    readInBackground();
  } catch (e) {
    $('#searchStatus').textContent = `Search failed: ${e.message}`;
  } finally {
    btn.disabled = false; $('#progress').hidden = true;
  }
});

// ---------- background reading of full postings ----------
// Listings that arrived with only a title get their posting read, best matches first, and are re-scored live.
let readGen = 0;
const setReadStatus = html => $$('.read-status').forEach(e => { e.innerHTML = html; e.hidden = !html; });
async function readInBackground() {
  const gen = ++readGen;
  const pending = () => [...state.interns, ...state.jobs].filter(j => !j.descLoaded && !j.readFailed && !j.reading && j.url);
  const total = pending().length;
  if (!total) return setReadStatus('');
  let done = 0, failed = 0, dirty = false;
  const flush = () => { if (dirty) { dirty = false; saveJobs(); renderAll(); } };
  const timer = setInterval(flush, 2500);
  const show = () => setReadStatus(`📄 Reading full job postings for exact scores: <b>${done}/${total}</b> done${failed ? ` · ${failed} sites blocked reading` : ''}. Best matches go first; scores update as each posting arrives.${state.readerKey ? '' : ' <span class="muted">(Free reader: about 18 per minute. Add a free Jina key in step 2 to go faster.)</span>'}`);
  show();
  const worker = async () => {
    for (;;) {
      if (gen !== readGen) return;
      const job = pending().sort((a, b) => b.fit.score - a.fit.score)[0];
      if (!job) return;
      job.reading = true;
      await loadDetail(job).catch(() => {});
      job.reading = false;
      if (gen !== readGen) return;
      if (job.descLoaded) job.fit = fitFor(job); else failed++;
      done++; dirty = true; show();
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  clearInterval(timer);
  flush();
  if (gen === readGen) setReadStatus(`✅ Read ${done - failed} of ${total} postings in full${failed ? `; ${failed} sites block automatic reading, so those stay title-only (open them to check)` : ''}. All other scores use the full description.`);
}

const fitFor = job => (job.lane === 'intern' ? scoreInternship : scoreJob)(job, { ...state.parsed, text: state.resume }, state.prefs || readPrefs());

function rescore(jobs = state.jobs, interns = state.interns) {
  for (const j of [...jobs, ...interns]) j.fit = fitFor(j);
  state.jobs = jobs;
  state.interns = interns;
  saveJobs();
  renderAll();
}

function saveJobs() {
  const slim = list => [...list].sort((a, b) => b.fit.score - a.fit.score).slice(0, 300).map(j => ({ ...j, desc: j.desc.slice(0, 7000) }));
  store.set('jobs', slim(state.jobs));
  store.set('interns', slim(state.interns));
}

const ago = t => {
  if (!t) return '';
  const h = (Date.now() - t) / 3600000;
  return h < 1 ? 'just now' : h < 24 ? `${Math.floor(h)}h ago` : `${Math.floor(h / 24)}d ago`;
};

// The card shows one good reason and one warning at most; the full story is one click away.
const cardWhy = f => {
  const good = f.reasons.find(r => /^Meets \d/.test(r)) || f.reasons.find(r => /skills it asks/.test(r)) || f.reasons.find(r => /^Relevant experience/.test(r));
  const bad = f.flags.find(x => /^Not eligible/.test(x)) || f.flags.find(x => !/title only|being read/.test(x));
  return [good, bad].filter(Boolean);
};
const eligPill = f => {
  const e = f.eligibility || [];
  if (e.some(c => c.status === 'no')) return '<span class="pill-s bad">Not eligible</span>';
  if (e.some(c => c.status === 'check' && ['citizenship', 'clearance', 'authorization'].includes(c.kind))) return '<span class="pill-s mid">Check eligibility</span>';
  return '';
};

function jobCard(j, inQueue) {
  const f = j.fit;
  return `<article class="job" data-id="${esc(j.id)}">
    <div class="score ${scoreClass(f.score)}">${f.score.toFixed(1)}<small>/ 5</small></div>
    <div class="job-main">
      <h4>${esc(j.title)}</h4>
      <div class="meta"><b>${esc(j.company)}</b><span>${esc(j.location || '—')}</span>${j.posted ? `<span>${ago(j.posted)}</span>` : ''}</div>
      <div class="pills"><span class="pill-s ${f.score >= 4 ? 'good' : f.score >= 3 ? 'mid' : 'bad'}">${esc(f.verdict)}</span>${j.lane === 'intern' && j.term ? `<span class="pill-s">${esc(j.term)}</span>` : ''}${f.tier <= 2 ? `<span class="pill-s hot">${esc(TIER_LABEL[f.tier])}</span>` : ''}${eligPill(f)}${j.descLoaded ? '' : '<span class="pill-s muted">Title only so far</span>'}</div>
      <div class="why">${cardWhy(f).map(esc).join(' · ')}</div>
    </div>
    <div class="acts">
      <button class="btn btn-small" data-act="kit">Open</button>
      ${inQueue ? '<button class="btn btn-small btn-ghost" data-act="unqueue">Remove</button>' : `<button class="btn btn-small btn-ghost" data-act="queue">${state.queue.includes(j.id) ? 'Queued ✓' : 'Queue'}</button>`}
    </div>
  </article>`;
}

function renderJobs() {
  const min = +$('#minScore').value, q = $('#jobFilter').value.toLowerCase(), sort = $('#sortBy').value;
  const list = state.jobs.filter(j => j.fit.score >= min && (!q || `${j.title} ${j.company} ${j.location}`.toLowerCase().includes(q)))
    .sort(sort === 'new' ? (a, b) => b.posted - a.posted : (a, b) => b.fit.score - a.fit.score || b.posted - a.posted);
  const shown = list.slice(0, 200);
  $('#jobList').innerHTML = shown.map(j => jobCard(j)).join('') || `<div class="empty">${state.jobs.length ? 'No jobs at this score. Lower the minimum score or widen your search.' : 'Your matches show up here.'}</div>`;
  if (list.length > 200) $('#jobList').insertAdjacentHTML('beforeend', `<p class="muted small center">Showing the top 200 of ${list.length}. Raise the minimum score or filter to narrow it.</p>`);
  const n = state.jobs.filter(j => j.fit.score >= 4).length;
  $('#jobsBadge').hidden = !state.jobs.length; $('#jobsBadge').textContent = n;
}
['#minScore', '#sortBy'].forEach(s => $(s).addEventListener('change', renderJobs));
$('#jobFilter').addEventListener('input', renderJobs);

function renderInterns() {
  const min = +$('#internMin').value, q = $('#internFilter').value.toLowerCase(), term = $('#internTerm').value, sort = $('#internSort').value;
  const list = state.interns.filter(j => j.fit.score >= min && (!term || (j.term || j.title).toLowerCase().includes(term)) && (!q || `${j.title} ${j.company} ${j.location}`.toLowerCase().includes(q)))
    .sort(sort === 'new' ? (a, b) => b.posted - a.posted : (a, b) => b.fit.score - a.fit.score || b.posted - a.posted);
  $('#internList').innerHTML = list.slice(0, 200).map(j => jobCard(j)).join('') || `<div class="empty">${state.interns.length ? 'No internships at this score or term. Lower the minimum score or pick "Any" term.' : 'Internships matched to your resume show up here after you search.'}</div>`;
  if (list.length > 200) $('#internList').insertAdjacentHTML('beforeend', `<p class="muted small center">Showing the top 200 of ${list.length}.</p>`);
  $('#internsBadge').hidden = !state.interns.length; $('#internsBadge').textContent = state.interns.filter(j => j.fit.score >= 4).length;
}
['#internMin', '#internTerm', '#internSort'].forEach(s => $(s).addEventListener('change', renderInterns));
$('#internFilter').addEventListener('input', renderInterns);
$('#queueInterns').addEventListener('click', () => {
  const top = state.interns.filter(j => j.fit.score >= 4);
  if (!top.length) return toast('No 4+ internships yet.');
  addToQueue(top);
  renderInterns();
  toast(`${top.length} internships queued. Open step 4 to apply.`);
});

const findJob = id => state.jobs.find(j => j.id === id) || state.interns.find(j => j.id === id);
const renderAll = () => { renderJobs(); renderInterns(); fillCheckJobs(); };

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const id = b.closest('[data-id]')?.dataset.id;
  const job = findJob(id);
  if (b.dataset.act === 'kit' && job) openKit(job);
  if (b.dataset.act === 'queue' && job) { addToQueue([job]); b.textContent = 'Queued ✓'; }
  if (b.dataset.act === 'unqueue') { state.queue = state.queue.filter(q => q !== id); store.set('queue', state.queue); renderQueue(); renderAll(); }
});

$('#queueTop').addEventListener('click', () => {
  const top = state.jobs.filter(j => j.fit.score >= 4);
  if (!top.length) return toast('No 4+ jobs yet.');
  addToQueue(top);
  renderJobs();
  toast(`${top.length} jobs queued. Open step 4 to apply.`);
});

function addToQueue(jobs) {
  for (const j of jobs) if (!state.queue.includes(j.id)) state.queue.push(j.id);
  store.set('queue', state.queue);
  renderQueue();
}

// ---------- tailoring kit ----------
function docFor(job) {
  if (state.edits[job.id]) return textToDoc(state.edits[job.id]);
  return tailorResume(state.parsed, state.profile, job, job.fit, state.extras[job.id] || []);
}

function textToDoc(text) {
  const lines = text.split('\n').map(l => l.trimEnd());
  const name = lines.shift() || '', contact = lines.shift() || '';
  const sections = [];
  for (const l of lines) {
    if (!l.trim()) continue;
    if (/^[A-Z][A-Z &/]{2,40}$/.test(l.trim())) sections.push({ title: l.trim(), lines: [] });
    else (sections[sections.length - 1] || sections[sections.push({ title: 'Experience', lines: [] }) - 1]).lines.push(l.trim());
  }
  return { name, contact, sections };
}

// The posting's requirements, each checked against the resume.
const REQ_MARK = { met: ['✓', 'good', 'You have this'], partial: ['◐', 'mid', 'Partly shown on your resume'], missing: ['✗', 'bad', 'Not on your resume'], soft: ['–', 'muted', 'Not something a resume can show: not counted'], eligibility: ['–', 'muted', 'Eligibility: checked against your profile, not counted as a gap'] };
function reqList(title, items) {
  // Eligibility lines are shown in "Can you apply?", so they're left out here.
  items = (items || []).filter(i => i.s !== 'eligibility');
  if (!items.length) return '';
  return `<h5>${title}</h5><div class="reqs">${items.map(i => {
    const [mark, tone, tip] = REQ_MARK[i.s] || REQ_MARK.soft;
    return `<div class="req" title="${tip}"><b style="color:var(--${tone === 'muted' ? 'ink-2' : tone})">${mark}</b><span class="${tone === 'muted' ? 'muted' : ''}">${esc(i.t)}</span></div>`;
  }).join('')}</div>`;
}

const ELIG_MARK = { ok: ['✓', 'good'], no: ['✗', 'bad'], check: ['?', 'mid'], info: ['i', 'ink-2'] };
function eligList(items) {
  if (!items?.length) return '<p class="muted small">No citizenship, clearance, license or schedule rules found in this posting.</p>';
  return `<div class="reqs">${items.map(c => { const [m, tone] = ELIG_MARK[c.status]; return `<div class="req"><b style="color:var(--${tone})">${m}</b><span><b>${esc(c.note)}</b><br><span class="muted">“${esc(c.text)}”</span></span></div>`; }).join('')}</div>`;
}

// The tailored resume is turned into the real PDF, read back like screening software reads it, parsed and
// scored again with the same rules as the job card.
async function pdfCheck(job, docText) {
  const blob = resumePdf(textToDoc(docText)).output('blob');
  const pdfText = await readResumeFile(new File([blob], 'check.pdf', { type: 'application/pdf' }));
  const parsed = parseResume(pdfText);
  const after = (job.lane === 'intern' ? scoreInternship : scoreJob)(job, { ...parsed, text: pdfText }, state.prefs || readPrefs());
  return atsReport({ pdfText, parsed, docText, job, before: job.fit, after, profile: state.profile, student: job.lane === 'intern' || !!job.fit.student });
}
const KW_MARK = { exact: ['✓', 'hit', 'Written exactly as the posting writes it'], close: ['≈', 'close', 'Same skill, different wording: use the posting\'s wording'], missing: ['✗', 'miss', 'Not in your PDF'] };
function renderReport(r) {
  const drop = r.score < r.before - 0.15;
  return `<div class="ats-score"><div class="score ${scoreClass(r.score)}">${r.score.toFixed(1)}<small>/ 5</small></div>
    <div><b>Score of this PDF as screening software reads it</b><br><span class="small ${drop ? 'bad-t' : 'muted'}">${drop ? `Lower than your resume's ${r.before.toFixed(1)}: something was lost in the PDF (see below).` : `Your original resume: ${r.before.toFixed(1)}. Same rules as the job card.`}</span></div></div>
    <div class="small">${r.checks.map(c => `<div class="check-item"><b style="color:var(--${c.ok ? 'good' : 'bad'})">${c.ok ? '✓' : '✗'}</b><span>${esc(c.text)}</span></div>`).join('')}</div>
    <h5>Keywords, as the posting words them <span class="muted">· ${esc(r.summary)}</span></h5>
    <div class="chips">${r.keywords.map(k => { const [m, cls, tip] = KW_MARK[k.status]; return `<span class="chip ${cls}" title="${tip}">${m} ${esc(k.word)}</span>`; }).join('') || '<span class="muted small">This posting names no specific tools or skills.</span>'}</div>
    ${r.phrases.length ? `<h5>Phrases from the posting</h5><div class="chips">${r.phrases.map(p => `<span class="chip ${p.status === 'exact' ? 'hit' : ''}" title="${p.status === 'exact' ? 'In your PDF' : 'Not in your PDF: only add it if it is true for you'}">${p.status === 'exact' ? '✓' : '○'} ${esc(p.word)}</span>`).join('')}</div>` : ''}`;
}

const fileName = job => `${(state.profile.name || 'Resume').replace(/\s+/g, '_')}_${job.company.replace(/\W+/g, '')}.pdf`;

async function openKit(job) {
  if (!job.descLoaded) {
    toast('Reading the full job posting…', 8000);
    try { job.readFailed = false; await loadDetail(job); if (job.descLoaded) { job.fit = fitFor(job); saveJobs(); } } catch { /* fall back to title-only */ }
  }
  const f = job.fit;
  const edu = state.parsed.education || {};
  const doc = docFor(job);
  const answers = applicationAnswers(state.profile, job, f, edu);
  const bar = (label, v) => `<div class="bar"><span>${label}</span><i><b style="width:${Math.round(v * 100)}%"></b></i><span>${Math.round(v * 100)}%</span></div>`;
  const jobText = `${job.title}\n${job.desc || ''}`;
  const kwWord = s => spellingIn(s, jobText) || pretty(s);
  const elig = f.eligibility || [];
  const blocked = elig.some(c => c.status === 'no');
  $('#modalBody').innerHTML = `
    <div class="kit-head">
      <div class="score ${scoreClass(f.score)}">${f.score.toFixed(1)}<small>/ 5</small></div>
      <div class="kit-title"><h3>${esc(job.title)}</h3><div class="muted small">${esc(job.company)} · ${esc(job.location || '—')}${job.posted ? ` · ${ago(job.posted)}` : ''}</div>
      <div class="small"><b>${esc(f.verdict)}</b>${blocked ? ' · You are not eligible for this one based on your profile.' : f.score < 4 ? ' · Below 4/5: skip it unless you have a specific reason (a referral, a dream company).' : ''}</div></div>
      <a class="btn btn-ghost btn-small" href="${esc(job.url)}" target="_blank" rel="noopener">View posting ↗</a>
    </div>
    <div class="kit-grid">
      <div>
        <section class="kit-sec"><h4>Can you apply?</h4>
          <p class="muted small">Checked against your work status in step 1, never your resume.</p>
          ${eligList(elig)}</section>
        <section class="kit-sec"><h4>Why ${f.score.toFixed(1)}</h4>
          <div class="breakdown">${bar(f.student ? 'Field' : 'Role', f.parts.title)}${bar('Skills & wording', f.parts.skills)}${bar('Experience', f.parts.experience ?? 0)}${bar(f.student ? 'Student fit' : 'Level', f.parts.seniority)}${bar('Your odds', f.parts.odds ?? 1)}</div>
          <ul class="why-list small">${f.flags.map(r => `<li class="warn">${esc(r)}</li>`).join('')}${f.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
          <p class="small muted">${esc(job.company)}: <b>${esc(TIER_LABEL[f.tier] || TIER_LABEL[4])}</b> (estimated from reputation and demand).${f.related?.length ? ` Counted as relevant experience: ${esc(f.related.join('; '))}.` : ''}</p></section>
        <section class="kit-sec"><h4>Requirements <span class="muted">(from the posting, checked against your resume)</span></h4>
          ${reqList('Must-haves', f.reqs?.must)}${reqList('Nice-to-haves', f.reqs?.nice)}${!f.reqs ? '<p class="muted small">No requirement list found in this posting.</p>' : ''}</section>
        <section class="kit-sec"><h4>Keywords</h4>
          <h5>You have <span class="muted">(written the posting's way on your tailored resume)</span></h5>
          <div class="chips">${f.matched.map(s => `<span class="chip hit">${esc(kwWord(s))}</span>`).join('') || '<span class="muted small">None detected.</span>'}</div>
          <h5>They want, not on your resume <span class="muted">(tick only what you really have)</span></h5>
          <div class="chips" id="missChips">${f.missing.map(s => `<label class="chip miss"><input type="checkbox" value="${esc(s)}" ${(state.extras[job.id] || []).includes(s) ? 'checked' : ''}>${esc(kwWord(s))}</label>`).join('') || '<span class="muted small">Nothing missing. 🎯</span>'}</div></section>
        <details class="kit-sec"><summary>Application answers</summary>
          <div class="small">${Object.entries(answers).map(([k, v]) => `<div class="check-item"><span style="flex:1"><b>${esc(k)}:</b> ${esc(v || '—')}</span><button class="btn btn-small btn-ghost" data-copy="${esc(v)}">Copy</button></div>`).join('')}</div></details>
        <details class="kit-sec"><summary>Cover letter</summary>
          <textarea id="kitCover" rows="9">${esc(state.edits['cover:' + job.id] || coverLetter(state.profile, job, f, edu))}</textarea></details>
      </div>
      <div>
        <section class="kit-sec"><h4>Your tailored resume <span class="muted">(edit freely)</span></h4>
          <textarea id="kitResume" rows="22">${esc(resumeText(doc))}</textarea>
          <div class="row">
            <button class="btn" id="kitPdf">Download PDF</button>
            <button class="btn btn-ghost" id="kitAi">${state.key ? 'AI rewrite for this job' : 'AI rewrite (add key in step 2)'}</button>
            <button class="btn btn-ghost" id="kitReset">Reset</button>
          </div>
          <div id="kitAiOut" class="small mt"></div></section>
        <section class="kit-sec ats"><h4>PDF check <span class="muted">(what screening software sees)</span></h4>
          <div id="kitAts" class="small muted">Reading your PDF back…</div></section>
      </div>
    </div>
    <div class="kit-foot">
      <button class="btn btn-ghost" id="kitQueue">${state.queue.includes(job.id) ? 'In queue ✓' : 'Add to queue'}</button>
      <button class="btn btn-big" id="kitApply">Download PDF & open application</button>
    </div>`;
  $('#modal').hidden = false;
  let checkGen = 0;
  const runAts = async () => {
    const gen = ++checkGen;
    $('#kitAts').innerHTML = 'Reading your PDF back…';
    try { const r = await pdfCheck(job, $('#kitResume').value); if (gen === checkGen) $('#kitAts').innerHTML = renderReport(r); }
    catch (e) { if (gen === checkGen) $('#kitAts').textContent = `Could not read the PDF back: ${e.message}`; }
  };
  let atsTimer;
  const atsSoon = () => { clearTimeout(atsTimer); atsTimer = setTimeout(runAts, 700); };
  runAts();

  const saveEdits = () => {
    state.edits[job.id] = $('#kitResume').value;
    state.edits['cover:' + job.id] = $('#kitCover').value;
    store.set('edits', state.edits);
  };
  $('#kitResume').addEventListener('change', saveEdits);
  $('#kitResume').addEventListener('input', atsSoon);
  $('#kitCover').addEventListener('change', saveEdits);
  $('#missChips')?.addEventListener('change', () => {
    state.extras[job.id] = $$('#missChips input:checked').map(i => i.value);
    store.set('extras', state.extras);
    delete state.edits[job.id];
    $('#kitResume').value = resumeText(docFor(job));
    atsSoon();
  });
  $('#kitPdf').onclick = () => { saveEdits(); resumePdf(textToDoc($('#kitResume').value)).save(fileName(job)); };
  $('#kitReset').onclick = () => { delete state.edits[job.id]; store.set('edits', state.edits); $('#kitResume').value = resumeText(docFor(job)); atsSoon(); };
  $('#kitQueue').onclick = e => { addToQueue([job]); e.target.textContent = 'In queue ✓'; };
  $('#kitApply').onclick = () => {
    saveEdits();
    resumePdf(textToDoc($('#kitResume').value)).save(fileName(job));
    window.open(job.applyUrl || job.url, '_blank', 'noopener');
    track(job, 'Applied');
    toast('Resume downloaded. Upload it on the page that just opened. Answers are in this window to copy.', 6000);
  };
  $('#kitAi').onclick = async () => {
    if (!state.key) return toast('Add your Anthropic API key in step 2 to use AI.');
    const out = $('#kitAiOut'), btn = $('#kitAi');
    btn.disabled = true; out.textContent = 'Claude is rewriting your resume for this job…';
    try {
      const r = await aiTailor(state.key, state.model, state.resume, job);
      const d = { name: state.profile.name, contact: doc.contact, sections: [{ title: 'SUMMARY', lines: [r.resume.summary] }, { title: 'SKILLS', lines: [r.resume.skills.join(', ')] }, ...r.resume.sections.map(s => ({ title: s.title.toUpperCase(), lines: s.lines }))] };
      // Education (and its graduation date) is never rewritten: always put the resume's own lines back.
      const eduLines = state.parsed.sections.filter(s => s.key === 'education').flatMap(s => s.lines);
      if (eduLines.length) {
        d.sections = d.sections.filter(s => !/EDUCATION|ACADEMIC/.test(s.title));
        d.sections.splice(job.lane === 'intern' ? 1 : d.sections.length, 0, { title: 'EDUCATION', lines: eduLines });
      }
      $('#kitResume').value = resumeText(d);
      if (r.coverLetter) $('#kitCover').value = r.coverLetter;
      saveEdits();
      atsSoon();
      out.innerHTML = `<b>AI fit: ${esc(r.fit?.score)}/5.</b> ${esc((r.fit?.why || []).join(' '))}<br>${r.fit?.risks?.length ? `<b>Watch out:</b> ${esc(r.fit.risks.join(' '))}<br>` : ''}${r.keywordsMissing?.length ? `<b>Couldn't honestly add:</b> ${esc(r.keywordsMissing.join(', '))}` : ''}`;
    } catch (e) { out.textContent = e.message; }
    btn.disabled = false;
  };
}

document.addEventListener('click', e => {
  const c = e.target.closest('[data-copy]');
  if (c) navigator.clipboard?.writeText(c.dataset.copy).then(() => toast('Copied'));
});
$('#modalX').addEventListener('click', () => ($('#modal').hidden = true));
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') $('#modal').hidden = true; });
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#modal').hidden = true; });

// ---------- queue, autopilot pack, tracker ----------
function queueJobs() { return state.queue.map(findJob).filter(Boolean); }

function renderQueue() {
  const jobs = queueJobs();
  $('#queueList').innerHTML = jobs.map(j => jobCard(j, true)).join('') || '<div class="empty">Queue jobs from step 3. "Queue all 4+" adds every strong match at once.</div>';
  $('#queueBadge').hidden = !jobs.length; $('#queueBadge').textContent = jobs.length;
}

const pdfBase64 = job => resumePdf(docFor(job)).output('datauristring').split(',')[1];

$('#exportPack').addEventListener('click', () => {
  const jobs = queueJobs();
  if (!jobs.length) return toast('Your queue is empty.');
  const pack = {
    version: 1, created: new Date().toISOString(), profile: state.profile,
    jobs: jobs.map(j => ({
      company: j.company, title: j.title, ats: j.ats, url: j.url, applyUrl: j.applyUrl, score: j.fit.score,
      resumeFile: fileName(j), resumePdfBase64: pdfBase64(j),
      coverLetter: state.edits['cover:' + j.id] || coverLetter(state.profile, j, j.fit, state.parsed.education),
      answers: applicationAnswers(state.profile, j, j.fit, state.parsed.education),
    })),
  };
  download(new Blob([JSON.stringify(pack)], { type: 'application/json' }), 'reverseapply-pack.json');
  jobs.forEach(j => track(j, 'Queued'));
  toast(`Autopilot pack saved with ${jobs.length} tailored applications.`);
});

$('#downloadAll').addEventListener('click', async () => {
  const jobs = queueJobs();
  if (!jobs.length) return toast('Your queue is empty.');
  const zip = new window.JSZip();
  for (const j of jobs) zip.file(fileName(j), pdfBase64(j), { base64: true });
  download(await zip.generateAsync({ type: 'blob' }), 'tailored-resumes.zip');
});
$('#clearQueue').addEventListener('click', () => { state.queue = []; store.set('queue', []); renderQueue(); renderAll(); });

function download(blob, name) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const STATUSES = ['Queued', 'Applied', 'Interview', 'Offer', 'Rejected', 'Hired'];
function track(job, status) {
  const row = state.tracker.find(r => r.id === job.id);
  if (row) { if (STATUSES.indexOf(status) > STATUSES.indexOf(row.status)) row.status = status; }
  else state.tracker.unshift({ id: job.id, date: new Date().toISOString().slice(0, 10), company: job.company, title: job.title, score: job.fit.score, status, url: job.url });
  store.set('tracker', state.tracker);
  renderTracker();
}
function renderTracker() {
  $('#trackerBody').innerHTML = state.tracker.map((r, i) => `<tr><td>${esc(r.date)}</td><td>${esc(r.company)}</td><td><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a></td><td>${r.score.toFixed(1)}</td>
    <td><select data-row="${i}">${STATUSES.map(s => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Applications you send show up here.</td></tr>';
}
$('#trackerBody').addEventListener('change', e => { const i = e.target.dataset.row; if (i != null) { state.tracker[i].status = e.target.value; store.set('tracker', state.tracker); } });

// ---------- resume checks ----------
const WEAK = /^(responsible for|helped|worked on|assisted|tasked with|participated in|duties included)/i;
const STRONG = /^(led|built|designed|developed|launched|created|improved|increased|reduced|delivered|drove|managed|implemented|automated|analyzed|optimized|shipped|owned|grew|scaled|architected|founded|negotiated|won|cut|saved|streamlined|spearheaded|established|mentored|coordinated|executed|engineered|deployed|migrated|resolved|achieved|generated|produced|trained|organized|directed|researched)/i;

$('#runCheck').addEventListener('click', () => {
  if (!state.parsed) return toast('Add your resume in step 1 first.');
  const p = state.parsed, text = state.resume;
  const bullets = text.split('\n').filter(l => /^[•\-*▪◦●■►‣–]/.test(l)).map(l => l.replace(/^[•\-*▪◦●■►‣–]\s*/, ''));
  const words = text.split(/\s+/).length;
  const quantified = bullets.filter(b => /\d|%|\$/.test(b)).length;
  const strong = bullets.filter(b => STRONG.test(b)).length;
  const weak = bullets.filter(b => WEAK.test(b));
  const keys = new Set(p.sections.map(s => s.key));
  const checks = [
    [!!state.profile.email, 'Email address present', 'Add an email address at the top.'],
    [!!state.profile.phone, 'Phone number present', 'Add a phone number at the top.'],
    [keys.has('experience') || keys.has('projects'), 'Has an Experience or Projects section with a standard heading', 'Use a heading called exactly "Experience" so screening software finds it.'],
    [keys.has('education'), 'Has an Education section', 'Add an "Education" heading.'],
    [keys.has('skills'), 'Has a Skills section', 'Add a "Skills" section listing tools and technologies; it\'s where keyword filters look first.'],
    [p.skills.length >= 8, `${p.skills.length} recognisable skills and keywords`, 'Fewer than 8 recognisable skills. Name the specific tools you use.'],
    [words >= 300 && words <= 900, `Length: ${words} words`, words < 300 ? `Only ${words} words. Add detail to your bullets.` : `${words} words is long. Aim for one page (400–700 words) unless you have 10+ years.`],
    [bullets.length >= 6, `${bullets.length} bullet points`, 'Use bullet points for your experience; screeners read bullets, not paragraphs.'],
    [bullets.length && quantified / bullets.length >= 0.4, `${quantified} of ${bullets.length} bullets have a number`, `Only ${quantified} of ${bullets.length} bullets show a number. Add results: %, $, time saved, users, rank.`],
    [bullets.length && strong / bullets.length >= 0.5, `${strong} bullets start with a strong verb`, 'Start each bullet with a strong verb: Built, Led, Increased, Reduced, Launched.'],
    [!weak.length, 'No weak openers like "Responsible for"', `Rewrite: "${weak.slice(0, 2).join('", "')}"`],
    [!/\b(I|my|me)\b/.test(text.replace(/^.*$/m, '')), 'No first-person pronouns', 'Drop "I" and "my": write "Built X", not "I built X".'],
  ];
  // What the parser got out of your file: the same reading every score uses.
  const lines = text.split('\n').filter(l => l.trim());
  const shortLines = lines.filter(l => l.trim().length <= 2).length;
  const jobsIn = (p.entries || []).filter(e => e.kind === 'job');
  const dated = jobsIn.filter(e => /(19|20)\d{2}|present/i.test(e.header)).length;
  checks.push(
    [shortLines / Math.max(1, lines.length) < 0.08, 'Text reads in order (no broken columns or text boxes)', 'Parts of your file read as scattered fragments: columns, tables or text boxes can scramble the order for screeners. A single-column layout is safest.'],
    [!jobsIn.length || dated === jobsIn.length, `Dates found on ${dated} of ${jobsIn.length} jobs`, `Only ${dated} of ${jobsIn.length} jobs have dates we can read. Put "Month Year – Month Year" on the same line as each job.`],
    [!!p.education?.school || !keys.has('education'), `School read as "${p.education?.school || ''}"`, 'Your school name was not recognised. Write it on its own line, e.g. "The Ohio State University".'],
    [!!state.profile.grad || (p.years || 0) >= 2, `Graduation date: ${state.profile.grad || 'not needed'}`, 'No graduation date found. Students: add "Expected May 2028" next to your degree.'],
  );
  const passed = checks.filter(c => c[0]).length;
  $('#checkOut').innerHTML = `<p><b>${passed}/${checks.length} checks passed.</b></p>` + checks.map(([ok, good, bad]) => `<div class="check-item"><b style="color:var(--${ok ? 'good' : 'bad'})">${ok ? '✓' : '✗'}</b><span>${esc(ok ? good : bad)}</span></div>`).join('');
});

// ---------- check against one job ----------
function fillCheckJobs() {
  const top = [...state.jobs, ...state.interns].sort((a, b) => b.fit.score - a.fit.score).slice(0, 60);
  const cur = $('#checkJob').value;
  $('#checkJob').innerHTML = '<option value="">Paste a posting instead…</option>' + top.map(j => `<option value="${esc(j.id)}">${j.fit.score.toFixed(1)} · ${esc(j.title)} · ${esc(j.company)}</option>`).join('');
  $('#checkJob').value = top.some(j => j.id === cur) ? cur : '';
}
$('#runJobCheck').addEventListener('click', async () => {
  if (!state.parsed) return toast('Add your resume in step 1 first.') || showTab('resume');
  let job = findJob($('#checkJob').value);
  if (!job) {
    const desc = $('#checkDesc').value.trim(), title = $('#checkTitle').value.trim() || 'This job';
    if (desc.length < 150) return toast('Pick one of your matches, or paste the full job posting.');
    job = { id: 'pasted', title, company: 'This company', location: '', desc, descLoaded: true, posted: Date.now(), url: '', lane: /\b(intern(ship)?|co-?op)\b/i.test(title) ? 'intern' : 'job' };
  }
  if (!job.descLoaded) { try { await loadDetail(job); } catch { /* title only */ } }
  job.fit = fitFor(job);
  const f = job.fit, out = $('#jobCheckOut');
  out.innerHTML = `<div class="ats-score"><div class="score ${scoreClass(f.score)}">${f.score.toFixed(1)}<small>/ 5</small></div><div><b>Your resume as it is: ${esc(f.verdict)}</b><br><span class="small muted">${esc(job.title)}${job.company !== 'This company' ? ` · ${esc(job.company)}` : ''}</span></div></div>
    <div class="kit-grid mt"><div>
      <h5>Can you apply?</h5>${eligList(f.eligibility)}
      <h5>Why</h5><ul class="why-list small">${f.flags.map(r => `<li class="warn">${esc(r)}</li>`).join('')}${f.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
      ${reqList('Must-haves', f.reqs?.must)}${reqList('Nice-to-haves', f.reqs?.nice)}
    </div><div>
      <h5>Your tailored resume for this job, as a PDF read back by screening software</h5>
      <div id="jobCheckAts" class="small muted">Reading the PDF back…</div>
      ${job.id !== 'pasted' ? '<button class="btn btn-small mt" id="jobCheckOpen">Open the full kit to edit and apply</button>' : ''}
    </div></div>`;
  $('#jobCheckOpen')?.addEventListener('click', () => openKit(job));
  try { $('#jobCheckAts').innerHTML = renderReport(await pdfCheck(job, resumeText(docFor(job)))); }
  catch (e) { $('#jobCheckAts').textContent = `Could not read the PDF back: ${e.message}`; }
});

$('#runPanel').addEventListener('click', async () => {
  if (!state.resume) return toast('Add your resume in step 1 first.');
  if (!state.key) { showTab('prefs'); $('#apiKey').focus(); return toast('The panel uses AI. Add your Anthropic API key here first.'); }
  const out = $('#panelOut'), btn = $('#runPanel');
  btn.disabled = true;
  out.innerHTML = '<p class="muted small">Seven reviewers are reading your resume…</p><div id="reviews"></div>';
  const card = r => `<div class="review"><header><span>${esc(r.name)}</span><span class="verdict-${r.verdict === 'pass' ? 'pass' : 'reject'}">${r.verdict === 'pass' ? 'Pass' : 'Reject'} · ${esc(r.score)}/10</span></header><ul>${(r.issues || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>`;
  try {
    const { reviews, improved } = await runPanel(state.key, state.model, state.resume, $('#panelRole').value, r => $('#reviews').insertAdjacentHTML('beforeend', card(r)));
    const passes = reviews.filter(r => r.verdict === 'pass').length;
    out.querySelector('p').innerHTML = `<b>${passes} of 7 would pass you.</b> Here's your rebuilt resume with every issue fixed:`;
    out.insertAdjacentHTML('beforeend', `<textarea id="improved" rows="20" class="mt">${esc(improved)}</textarea>
      <div class="row"><button class="btn" id="useImproved">Use as my resume</button><button class="btn btn-ghost" id="pdfImproved">Download PDF</button></div>`);
    $('#useImproved').onclick = () => { $('#resumeText').value = $('#improved').value; applyResume($('#improved').value, false); state.edits = {}; store.set('edits', {}); if (state.jobs.length || state.interns.length) rescore(); toast('Resume updated. Scores refreshed.'); };
    $('#pdfImproved').onclick = () => resumePdf(textToDoc($('#improved').value)).save('Resume_improved.pdf');
  } catch (e) { out.innerHTML = `<p class="small" style="color:var(--bad)">${esc(e.message)}</p>`; }
  btn.disabled = false;
});

// ---------- boot ----------
$('#companyCount').textContent = `${COMPANIES.length}+`;
$$('.cc').forEach(e => (e.textContent = `${COMPANIES.length}`));
if (location.hostname.endsWith('github.io')) {
  const owner = location.hostname.split('.')[0], repo = location.pathname.split('/')[1] || `${owner}.github.io`;
  $('#repoLink').href = `https://github.com/${owner}/${repo}`;
  $('#zipLink').href = `https://github.com/${owner}/${repo}/archive/refs/heads/main.zip`;
} else {
  $('#zipLink').href = $('#repoLink').href;
}
for (const [k, sel] of Object.entries(ELIG_BOXES)) $(sel).checked = !!state.profile[k];
if (state.profile.auth) $('#pAuth').value = state.profile.auth;
if (state.resume) { $('#resumeText').value = state.resume; applyResume(state.resume, false); }
if (state.prefs) {
  writePrefs(state.prefs);
  renderRoleChips();
  // Searches saved before career paths and eligibility existed: fill those in so scores use them.
  if (state.parsed) Object.assign(state.prefs, { paths: searchPaths(state.prefs.roles, state.parsed).map(p => p.id), museCats: museCategories(state.prefs.roles, state.parsed), ...eligPrefs() });
}
if (state.key) { $('#apiKey').value = state.key; $('#keyStatus').textContent = 'Key saved in this browser.'; }
$('#apiModel').value = state.model;
// Re-score saved results so they always use the current scoring rules.
if (state.parsed && (state.jobs.length || state.interns.length)) rescore();
if (state.jobs.length && state.parsed) { $('#searchStatus').textContent = `${state.jobs.length} jobs from your last search. Run it again for the newest.`; }
if (state.readerKey) $('#readerKey').value = state.readerKey;
if (state.parsed && (state.jobs.length || state.interns.length)) readInBackground();
if (state.interns.length && state.parsed) { $('#internStatus').textContent = `${state.interns.length} internships from your last search. Run it again for the newest.`; }
renderQueue();
renderTracker();

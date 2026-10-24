import { COMPANIES } from './companies.js';
import { readResumeFile, parseResume } from './resume.js';
import { searchJobs, parseBoardLinks, loadGreenhouseDetail } from './search.js';
import { scoreJob, scoreClass } from './score.js';
import { tailorResume, resumePdf, resumeText, coverLetter, applicationAnswers } from './tailor.js';
import { pretty } from './skills.js';
import { runPanel, aiTailor } from './ai.js';

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
  queue: store.get('queue', []),
  tracker: store.get('tracker', []),
  edits: store.get('edits', {}),     // jobId -> edited resume text
  extras: store.get('extras', {}),   // jobId -> skills the user confirmed they have
  key: store.get('key', ''),
  model: store.get('model', 'claude-sonnet-5-5'),
};

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

// ---------- resume ----------
const PROFILE_FIELDS = { name: '#pName', email: '#pEmail', phone: '#pPhone', location: '#pLocation', linkedin: '#pLinkedin', site: '#pSite', auth: '#pAuth' };

function applyResume(text, fromFile) {
  state.resume = text;
  state.parsed = parseResume(text);
  store.set('resume', text);
  const guessed = state.parsed.profile;
  for (const [k, sel] of Object.entries(PROFILE_FIELDS)) {
    // A new file overwrites what it can detect; pasted edits only fill blanks.
    if (guessed[k] && (fromFile || !state.profile[k])) state.profile[k] = guessed[k];
    if (state.profile[k]) $(sel).value = state.profile[k];
  }
  store.set('profile', state.profile);
  $('#skillChips').innerHTML = state.parsed.skills.map(s => `<span class="chip">${esc(pretty(s))}</span>`).join('') || '<span class="muted small">No known skills found yet. Make sure your resume has a Skills section.</span>';
  $('#skillCount').textContent = `(${state.parsed.skills.length})`;
  $('#resumeStatus').textContent = `Loaded · ${text.split(/\s+/).length} words · about ${state.parsed.years} years of dated experience`;
  if (!$('#fRoles').value) $('#fRoles').value = guessRoles(text);
}

function guessRoles(text) {
  const m = text.match(/\b(software|data|machine learning|product|frontend|backend|full[- ]stack|marketing|sales|financial|business|ux|ui|mechanical|electrical|civil|research|operations|project)\s+(engineer|analyst|scientist|manager|designer|developer|associate|specialist|intern)\b/i);
  return m ? m[0].toLowerCase() : '';
}

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

// ---------- preferences ----------
const splitList = s => s.split(',').map(x => x.trim()).filter(Boolean);
function readPrefs() {
  return {
    roles: splitList($('#fRoles').value), keywords: splitList($('#fKeywords').value), exclude: splitList($('#fExclude').value),
    where: $('#fWhere').value, places: splitList($('#fPlaces').value), level: $('#fLevel').value, ageDays: +$('#fAge').value,
    useAts: $('#srcAts').checked, useRemote: $('#srcRemote').checked, extra: $('#extraBoards').value,
    needsSponsor: /sponsor/i.test($('#pAuth').value),
  };
}
function writePrefs(p) {
  $('#fRoles').value = p.roles.join(', '); $('#fKeywords').value = p.keywords.join(', '); $('#fExclude').value = p.exclude.join(', ');
  $('#fWhere').value = p.where; $('#fPlaces').value = p.places.join(', '); $('#fLevel').value = p.level; $('#fAge').value = String(p.ageDays);
  $('#srcAts').checked = p.useAts; $('#srcRemote').checked = p.useRemote; $('#extraBoards').value = p.extra || '';
  $('#fPlacesWrap').hidden = p.where !== 'custom';
}
$('#fWhere').addEventListener('change', e => ($('#fPlacesWrap').hidden = e.target.value !== 'custom'));

$('#saveKey').addEventListener('click', () => {
  state.key = $('#apiKey').value.trim(); state.model = $('#apiModel').value;
  store.set('key', state.key); store.set('model', state.model);
  $('#keyStatus').textContent = state.key ? 'Saved in this browser.' : '';
});
$('#clearKey').addEventListener('click', () => { state.key = ''; $('#apiKey').value = ''; store.set('key', ''); $('#keyStatus').textContent = 'Forgotten.'; });
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
    const { jobs, scanned } = await searchJobs(prefs, parseBoardLinks(prefs.extra), p => {
      $('#progress div').style.width = `${(p.done / p.total) * 100}%`;
      $('#searchStatus').textContent = `Searching ${p.done}/${p.total} sources · ${p.scanned.toLocaleString()} openings read · ${p.found} match so far`;
    });
    rescore(jobs);
    $('#searchStatus').textContent = `Read ${scanned.toLocaleString()} openings from ${COMPANIES.length + 3} sources in ${((performance.now() - started) / 1000).toFixed(1)}s · ${jobs.length} match your search · ${jobs.filter(j => j.fit.score >= 4).length} scored 4+`;
  } catch (e) {
    $('#searchStatus').textContent = `Search failed: ${e.message}`;
  } finally {
    btn.disabled = false; $('#progress').hidden = true;
  }
});

function rescore(jobs = state.jobs) {
  const resume = { ...state.parsed, text: state.resume };
  const prefs = state.prefs || readPrefs();
  for (const j of jobs) j.fit = scoreJob(j, resume, prefs);
  state.jobs = jobs;
  saveJobs();
  renderJobs();
}

function saveJobs() {
  store.set('jobs', [...state.jobs].sort((a, b) => b.fit.score - a.fit.score).slice(0, 400).map(j => ({ ...j, desc: j.desc.slice(0, 9000) })));
}

const ago = t => {
  if (!t) return '';
  const h = (Date.now() - t) / 3600000;
  return h < 1 ? 'just now' : h < 24 ? `${Math.floor(h)}h ago` : `${Math.floor(h / 24)}d ago`;
};

function jobCard(j, inQueue) {
  return `<article class="job" data-id="${esc(j.id)}">
    <div class="score ${scoreClass(j.fit.score)}">${j.fit.score.toFixed(1)}<small>/ 5</small></div>
    <div>
      <h4>${esc(j.title)}</h4>
      <div class="meta"><b>${esc(j.company)}</b><span>${esc(j.location || '—')}</span><span>${ago(j.posted)}</span><span>${esc(j.ats)}</span></div>
      <div class="why"><b>${esc(j.fit.verdict)}</b> · ${esc([...j.fit.reasons.slice(1, 2), ...j.fit.flags].join(' · '))}${j.fit.label ? ` · matches ${esc(j.fit.label)}` : ''}</div>
    </div>
    <div class="acts">
      <button class="btn btn-small" data-act="kit">Tailor & apply</button>
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

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const id = b.closest('[data-id]')?.dataset.id;
  const job = state.jobs.find(j => j.id === id);
  if (b.dataset.act === 'kit' && job) openKit(job);
  if (b.dataset.act === 'queue' && job) { addToQueue([job]); b.textContent = 'Queued ✓'; }
  if (b.dataset.act === 'unqueue') { state.queue = state.queue.filter(q => q !== id); store.set('queue', state.queue); renderQueue(); renderJobs(); }
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

const fileName = job => `${(state.profile.name || 'Resume').replace(/\s+/g, '_')}_${job.company.replace(/\W+/g, '')}.pdf`;

async function openKit(job) {
  if (!job.descLoaded && job.ats === 'greenhouse') {
    try { await loadGreenhouseDetail(job); job.fit = scoreJob(job, { ...state.parsed, text: state.resume }, state.prefs || readPrefs()); saveJobs(); } catch { /* fall back to title-only */ }
  }
  const f = job.fit;
  const doc = docFor(job);
  const answers = applicationAnswers(state.profile, job, f);
  const bar = (label, v) => `<div class="bar"><span>${label}</span><i><b style="width:${Math.round(v * 100)}%"></b></i><span>${Math.round(v * 100)}%</span></div>`;
  $('#modalBody').innerHTML = `
    <div class="row" style="margin:0 0 14px;align-items:flex-start">
      <div class="score ${scoreClass(f.score)}">${f.score.toFixed(1)}<small>/ 5</small></div>
      <div style="flex:1;min-width:200px"><h3 style="margin:0">${esc(job.title)}</h3><div class="muted small">${esc(job.company)} · ${esc(job.location)} · ${ago(job.posted)}</div>
      <div class="small"><b>${esc(f.verdict)}</b>${f.score < 4 ? ' · Below 4/5 we recommend skipping unless you have a specific reason (a referral, a dream company).' : ''}</div></div>
    </div>
    <div class="kit-grid">
      <div>
        <h4>Why this score</h4>
        <div class="breakdown">${bar('Title', f.parts.title)}${bar('Skills', f.parts.skills)}${bar('Level', f.parts.seniority)}${bar('Freshness', f.parts.fresh)}</div>
        <ul class="small">${[...f.reasons, ...f.flags].map(r => `<li>${esc(r)}</li>`).join('')}</ul>
        <h4>Keywords you already have <span class="muted">(moved to the top of your resume)</span></h4>
        <div class="chips">${f.matched.map(s => `<span class="chip hit">${esc(pretty(s))}</span>`).join('') || '<span class="muted small">None detected.</span>'}</div>
        <h4>Keywords they want that your resume doesn't show</h4>
        <p class="muted small">Tick only the ones you genuinely have. They'll be added to your skills for this job.</p>
        <div class="chips" id="missChips">${f.missing.map(s => `<label class="chip miss"><input type="checkbox" value="${esc(s)}" ${(state.extras[job.id] || []).includes(s) ? 'checked' : ''}>${esc(pretty(s))}</label>`).join('') || '<span class="muted small">Nothing missing. 🎯</span>'}</div>
        <h4>Application answers</h4>
        <div class="small">${Object.entries(answers).map(([k, v]) => `<div class="check-item"><span style="flex:1"><b>${esc(k)}:</b> ${esc(v || '—')}</span><button class="btn btn-small btn-ghost" data-copy="${esc(v)}">Copy</button></div>`).join('')}</div>
        <h4>Cover letter</h4>
        <textarea id="kitCover" rows="9">${esc(state.edits['cover:' + job.id] || coverLetter(state.profile, job, f))}</textarea>
      </div>
      <div>
        <h4>Your tailored resume <span class="muted">(edit freely)</span></h4>
        <textarea id="kitResume" rows="26">${esc(resumeText(doc))}</textarea>
        <div class="row">
          <button class="btn" id="kitPdf">Download PDF</button>
          <button class="btn btn-ghost" id="kitAi">${state.key ? 'AI rewrite for this job' : 'AI rewrite (add key in step 2)'}</button>
          <button class="btn btn-ghost" id="kitReset">Reset</button>
        </div>
        <div id="kitAiOut" class="small mt"></div>
      </div>
    </div>
    <div class="row mt" style="justify-content:flex-end;border-top:1px solid var(--line);padding-top:16px">
      <a class="btn btn-ghost" href="${esc(job.url)}" target="_blank" rel="noopener">View posting</a>
      <button class="btn btn-ghost" id="kitQueue">${state.queue.includes(job.id) ? 'In queue ✓' : 'Add to queue'}</button>
      <button class="btn btn-big" id="kitApply">Download PDF & open application</button>
    </div>`;
  $('#modal').hidden = false;

  const saveEdits = () => {
    state.edits[job.id] = $('#kitResume').value;
    state.edits['cover:' + job.id] = $('#kitCover').value;
    store.set('edits', state.edits);
  };
  $('#kitResume').addEventListener('change', saveEdits);
  $('#kitCover').addEventListener('change', saveEdits);
  $('#missChips')?.addEventListener('change', () => {
    state.extras[job.id] = $$('#missChips input:checked').map(i => i.value);
    store.set('extras', state.extras);
    delete state.edits[job.id];
    $('#kitResume').value = resumeText(docFor(job));
  });
  $('#kitPdf').onclick = () => { saveEdits(); resumePdf(textToDoc($('#kitResume').value)).save(fileName(job)); };
  $('#kitReset').onclick = () => { delete state.edits[job.id]; store.set('edits', state.edits); $('#kitResume').value = resumeText(docFor(job)); };
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
      $('#kitResume').value = resumeText(d);
      if (r.coverLetter) $('#kitCover').value = r.coverLetter;
      saveEdits();
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
function queueJobs() { return state.queue.map(id => state.jobs.find(j => j.id === id)).filter(Boolean); }

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
      coverLetter: state.edits['cover:' + j.id] || coverLetter(state.profile, j, j.fit),
      answers: applicationAnswers(state.profile, j, j.fit),
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
$('#clearQueue').addEventListener('click', () => { state.queue = []; store.set('queue', []); renderQueue(); renderJobs(); });

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
  const passed = checks.filter(c => c[0]).length;
  $('#checkOut').innerHTML = `<p><b>${passed}/${checks.length} checks passed.</b></p>` + checks.map(([ok, good, bad]) => `<div class="check-item"><b style="color:var(--${ok ? 'good' : 'bad'})">${ok ? '✓' : '✗'}</b><span>${esc(ok ? good : bad)}</span></div>`).join('');
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
    $('#useImproved').onclick = () => { $('#resumeText').value = $('#improved').value; applyResume($('#improved').value, false); state.edits = {}; store.set('edits', {}); if (state.jobs.length) rescore(); toast('Resume updated. Scores refreshed.'); };
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
if (state.resume) { $('#resumeText').value = state.resume; applyResume(state.resume, false); }
if (state.prefs) writePrefs(state.prefs);
if (state.key) { $('#apiKey').value = state.key; $('#keyStatus').textContent = 'Key saved in this browser.'; }
$('#apiModel').value = state.model;
if (state.jobs.length && state.parsed) { renderJobs(); $('#searchStatus').textContent = `${state.jobs.length} jobs from your last search. Run it again for the newest.`; }
renderQueue();
renderTracker();

// Pulls openings straight from employer job boards and remote job feeds, then filters them.
import { COMPANIES } from './companies.js';

const DAY = 86400000;
const NAMES = { doordashusa: 'DoorDash', gleanwork: 'Glean', wizinc: 'Wiz', dbtlabsinc: 'dbt Labs', claylabs: 'Clay', andurilindustries: 'Anduril', scaleai: 'Scale AI', xai: 'xAI', openai: 'OpenAI', squareup: 'Square', hellofresh: 'HelloFresh', getyourguide: 'GetYourGuide', sumup: 'SumUp', n8n: 'n8n', deepl: 'DeepL', alephalpha: 'Aleph Alpha', elevenlabs: 'ElevenLabs', hackerone: 'HackerOne', workos: 'WorkOS', posthog: 'PostHog', planetscale: 'PlanetScale', cockroachlabs: 'Cockroach Labs', launchdarkly: 'LaunchDarkly', digitalocean: 'DigitalOcean', pagerduty: 'PagerDuty', newrelic: 'New Relic', mongodb: 'MongoDB', gitlab: 'GitLab', github: 'GitHub', hubspot: 'HubSpot', sofi: 'SoFi', clickup: 'ClickUp', runwayml: 'Runway', humeai: 'Hume AI', arizeai: 'Arize AI', grafanalabs: 'Grafana Labs', hudsonrivertrading: 'Hudson River Trading', janestreet: 'Jane Street', twosigma: 'Two Sigma', akunacapital: 'Akuna Capital', sig: 'SIG', imc: 'IMC', drw: 'DRW', appliedintuition: 'Applied Intuition', lucidmotors: 'Lucid Motors', warbyparker: 'Warby Parker', sentinelone: 'SentinelOne', crowdstrike: 'CrowdStrike', abnormalsecurity: 'Abnormal Security', '1password': '1Password', 'black-forest-labs': 'Black Forest Labs', isomorphiclabs: 'Isomorphic Labs', stabilityai: 'Stability AI', backmarket: 'Back Market', blablacar: 'BlaBlaCar', gocardless: 'GoCardless', truelayer: 'TrueLayer', jumpcloud: 'JumpCloud', shieldai: 'Shield AI' };
export const companyName = slug => NAMES[slug.toLowerCase()] || slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const htmlToText = html => {
  if (!html) return '';
  // DOMParser documents are inert: posting HTML never runs scripts or loads images.
  const parse = s => new DOMParser().parseFromString(s, 'text/html');
  const d = parse(html.includes('&lt;') ? parse(html).documentElement.textContent : html).body;
  d.querySelectorAll('li').forEach(li => li.prepend('• '));
  d.querySelectorAll('p,li,br,h1,h2,h3,h4,div').forEach(n => n.append('\n'));
  return d.textContent.replace(/\n\s*\n+/g, '\n').trim();
};

async function getJson(url, ms = 20000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const it = items[i++]; try { await fn(it); } catch { /* one dead board never stops the search */ } }
  }));
}

const fromGreenhouse = (slug, j) => ({
  id: `gh-${slug}-${j.id}`, ats: 'greenhouse', slug, jobId: j.id, company: j.company_name || companyName(slug), title: j.title,
  location: j.location?.name || '', posted: Date.parse(j.first_published || j.updated_at) || 0,
  url: j.absolute_url, applyUrl: j.absolute_url, desc: '', descLoaded: false,
});
const fromLever = (slug, j) => ({
  id: `lv-${slug}-${j.id}`, ats: 'lever', slug, jobId: j.id, company: companyName(slug), title: j.text,
  location: [j.categories?.location, ...(j.categories?.allLocations || [])].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' / ') + (j.workplaceType === 'remote' ? ' (Remote)' : ''),
  posted: j.createdAt || 0, url: j.hostedUrl, applyUrl: j.applyUrl || `${j.hostedUrl}/apply`,
  desc: [j.descriptionPlain, ...(j.lists || []).map(l => `${l.text}\n${htmlToText(l.content)}`), j.additionalPlain].filter(Boolean).join('\n'), descLoaded: true,
});
const fromAshby = (slug, j) => ({
  id: `ab-${slug}-${j.id}`, ats: 'ashby', slug, jobId: j.id, company: companyName(slug), title: j.title,
  location: (j.location || '') + (j.isRemote && !/remote/i.test(j.location || '') ? ' (Remote)' : ''),
  posted: Date.parse(j.publishedAt) || 0, url: j.jobUrl, applyUrl: j.applyUrl || `${j.jobUrl}/application`,
  desc: j.descriptionPlain || htmlToText(j.descriptionHtml), descLoaded: true,
});

async function fetchBoard(ats, slug) {
  const list = ats === 'greenhouse' ? (await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`)).jobs.map(j => fromGreenhouse(slug, j))
    : ats === 'lever' ? (await getJson(`https://api.lever.co/v0/postings/${slug}?mode=json`)).map(j => fromLever(slug, j))
    : (await getJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}`)).jobs.filter(j => j.isListed !== false).map(j => fromAshby(slug, j));
  // How many openings the employer has is a rough size signal for the competition estimate.
  for (const j of list) j.boardSize = list.length;
  return list;
}

// Fetches the full description for listings that arrive without one
// (Greenhouse lists, and internship-list links that point at Greenhouse, Lever or Ashby).
const ashbyBoards = {};
export async function loadDetail(job) {
  if (job.descLoaded) return job;
  const u = job.url || '';
  let m;
  if (job.ats === 'greenhouse' && job.slug) {
    job.desc = htmlToText((await getJson(`https://boards-api.greenhouse.io/v1/boards/${job.slug}/jobs/${job.jobId}`)).content);
  } else if ((m = u.match(/greenhouse\.io\/(?:embed\/job_app\?for=)?([\w-]+)\/jobs\/(\d+)/))) {
    job.desc = htmlToText((await getJson(`https://boards-api.greenhouse.io/v1/boards/${m[1]}/jobs/${m[2]}`)).content);
  } else if ((m = u.match(/jobs\.lever\.co\/([\w.-]+)\/([0-9a-f-]{36})/))) {
    const j = await getJson(`https://api.lever.co/v0/postings/${m[1]}/${m[2]}`);
    job.desc = [j.descriptionPlain, ...(j.lists || []).map(l => `${l.text}\n${htmlToText(l.content)}`), j.additionalPlain].filter(Boolean).join('\n');
  } else if ((m = u.match(/jobs\.ashbyhq\.com\/([\w.%-]+)\/([0-9a-f-]{36})/))) {
    ashbyBoards[m[1]] ??= getJson(`https://api.ashbyhq.com/posting-api/job-board/${m[1]}`);
    const j = (await ashbyBoards[m[1]]).jobs.find(x => x.id === m[2]);
    if (!j) return job;
    job.desc = j.descriptionPlain || htmlToText(j.descriptionHtml);
  } else {
    return job;
  }
  job.descLoaded = true;
  return job;
}

// Student-run internship lists (hundreds of companies, updated daily).
const INTERN_LISTS = [
  'https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json',
  'https://raw.githubusercontent.com/vanshb03/Summer2027-Internships/dev/.github/scripts/listings.json',
];
const atsOf = url => /greenhouse\.io/.test(url) ? 'greenhouse' : /lever\.co/.test(url) ? 'lever' : /ashbyhq\.com/.test(url) ? 'ashby' : /myworkdayjobs/.test(url) ? 'workday' : 'company site';

async function internLists() {
  const out = [];
  await pool(INTERN_LISTS, 2, async src => {
    for (const j of await getJson(src, 45000)) {
      if (!j.active || j.is_visible === false || !j.url) continue;
      out.push({
        id: `il-${j.id}`, ats: atsOf(j.url), company: j.company_name, title: j.title, location: (j.locations || []).join(' / '),
        posted: (j.date_posted || 0) * 1000, url: j.url, applyUrl: j.url, desc: '', descLoaded: false,
        term: (j.terms || [j.season]).filter(t => t && t !== 'N/A').join(', '), sponsorship: j.sponsorship || '', category: j.category || '',
        degrees: j.degrees || [],
      });
    }
  });
  return out;
}

async function remoteFeeds(terms) {
  const out = [];
  const q = encodeURIComponent(terms[0] || '');
  const tasks = [
    async () => (await getJson(`https://remotive.com/api/remote-jobs?search=${q}&limit=150`)).jobs.forEach(j => out.push({
      id: `rm-${j.id}`, ats: 'remotive', company: j.company_name, title: j.title, location: `Remote (${j.candidate_required_location || 'Worldwide'})`,
      posted: Date.parse(j.publication_date) || 0, url: j.url, applyUrl: j.url, desc: htmlToText(j.description), descLoaded: true })),
    async () => (await getJson(`https://jobicy.com/api/v2/remote-jobs?count=100${q ? `&tag=${q}` : ''}`)).jobs?.forEach(j => out.push({
      id: `jc-${j.id}`, ats: 'jobicy', company: j.companyName, title: j.jobTitle, location: `Remote (${j.jobGeo || 'Anywhere'})`,
      posted: Date.parse(j.pubDate) || 0, url: j.url, applyUrl: j.url, desc: htmlToText(j.jobDescription), descLoaded: true })),
    async () => (await getJson('https://www.arbeitnow.com/api/job-board-api')).data.forEach(j => out.push({
      id: `an-${j.slug}`, ats: 'arbeitnow', company: j.company_name, title: j.title, location: j.location + (j.remote ? ' (Remote)' : ''),
      posted: (j.created_at || 0) * 1000, url: j.url, applyUrl: j.url, desc: htmlToText(j.description), descLoaded: true })),
  ];
  await pool(tasks, 3, t => t());
  return out;
}

// Turns pasted board links into [ats, slug] pairs.
export function parseBoardLinks(text) {
  const out = [];
  for (const m of (text || '').matchAll(/(greenhouse\.io|lever\.co|ashbyhq\.com)\/(?:embed\/job_board\?for=|v1\/boards\/)?([A-Za-z0-9_.-]+)/g)) {
    out.push([m[1].startsWith('green') ? 'greenhouse' : m[1].startsWith('lever') ? 'lever' : 'ashby', m[2]]);
  }
  return out;
}

const STOP = new Set(['and', 'or', 'of', 'the', 'a', 'an', 'in', 'for', 'to', 'with', 'i', 'ii', 'iii']);
const VARIANTS = { engineer: ['engineer', 'engineering', 'developer', 'swe'], developer: ['developer', 'engineer', 'dev'], analyst: ['analyst', 'analytics'], manager: ['manager', 'management', 'lead'], designer: ['designer', 'design'], scientist: ['scientist', 'science'], intern: ['intern', 'internship', 'co-op'], internship: ['intern', 'internship', 'co-op'], software: ['software', 'swe', 'full stack', 'fullstack', 'backend', 'back end', 'frontend', 'front end'], marketing: ['marketing', 'growth'], sales: ['sales', 'account executive', 'business development'] };

export function titleMatcher(roles) {
  const groups = roles.map(r => r.toLowerCase().split(/[\s/,-]+/).filter(w => w && !STOP.has(w)).map(w => VARIANTS[w] || [w]));
  return title => {
    const t = ` ${title.toLowerCase()} `;
    return groups.some(g => g.every(alts => alts.some(a => t.includes(a.length <= 3 ? ` ${a} ` : a))));
  };
}

// Internships, co-ops and student programs go to their own tab, never to "Jobs".
const INTERN_RE = /\b(interns?|internships?|co-?op|apprentice(ship)?|working student|student (researcher|worker|assistant|analyst|developer|engineer|program)|summer (analyst|associate|scholar)|werkstudent|praktikum|stagiaire)\b/i;
export const isInternTitle = title => INTERN_RE.test(title);
const GRAD_ONLY = /\b(ph\.?\s?d|doctoral|postdoc|master'?s|mba)\b/i;

const GENERIC = new Set(['engineer', 'engineering', 'developer', 'analyst', 'manager', 'specialist', 'associate', 'assistant', 'coordinator', 'intern', 'internship', 'co-op', 'student', 'summer', 'junior', 'entry', 'level', 'new', 'grad']);
const CATEGORY_HINTS = [[/software|developer|web|frontend|backend|full.?stack|mobile|swe/, /software/i], [/data|machine|learning|ml|ai|analyst|analytics|science/, /data|ai|ml/i], [/hardware|electrical|mechanical|embedded|firmware|chip|robotic/, /hardware/i], [/product/, /product/i], [/quant|trading|finance/, /quant/i]];

// An internship matches when its title shares the field of a target role ("data analyst" -> "Data Science Intern").
export function internMatcher(roles) {
  const cleaned = roles.map(r => r.replace(INTERN_RE, '').trim()).filter(Boolean);
  const exact = titleMatcher(cleaned);
  const words = [...new Set(cleaned.flatMap(r => r.toLowerCase().split(/[\s/,-]+/)).filter(w => w.length > 1 && !STOP.has(w) && !GENERIC.has(w)))];
  const cats = CATEGORY_HINTS.filter(([re]) => cleaned.some(r => re.test(r.toLowerCase()))).map(([, cat]) => cat);
  return job => !cleaned.length || exact(job.title) || words.some(w => new RegExp(`\\b${w}`, 'i').test(job.title)) || (job.category && cats.some(c => c.test(job.category)));
}

const US_STATES = 'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' ');
const US_RE = new RegExp(`united states|\\busa?\\b|\\bu\\.s\\.|,\\s?(${US_STATES.join('|')})\\b|new york|san francisco|seattle|austin|boston|chicago|los angeles|denver|atlanta|miami|washington|bay area|silicon valley|remote - us|north america|americas`, 'i');

// Remote roles tied to another country don't count as US.
const NON_US = /europe|emea|\buk\b|united kingdom|london|germany|berlin|munich|hamburg|india|bangalore|bengaluru|canada|toronto|vancouver|latam|apac|brazil|poland|spain|madrid|barcelona|france|paris|netherlands|amsterdam|switzerland|zurich|zug|austria|vienna|ireland|dublin|portugal|lisbon|italy|sweden|stockholm|denmark|copenhagen|norway|finland|israel|tel aviv|singapore|japan|tokyo|australia|sydney|mexico|argentina|colombia|philippines|nigeria|kenya|south africa|dubai|uae/i;

const CA_PROVINCE = /,\s?(ON|QC|BC|AB|MB|NS|NB|SK)\b|ontario|quebec|montr[eé]al|british columbia|alberta/;

export function locationOk(job, where, places) {
  const loc = `${job.location} ${job.title}`;
  const remote = /remote|anywhere|distributed|work from home/i.test(loc);
  if (where === 'remote') return remote;
  // Check each listed place on its own, so "Toronto, ON, CA" (Canada) doesn't pass as California.
  if (where === 'us') return `${job.location}`.split(/\s*[/;|]\s*/).concat(job.location ? [] : [job.title]).some(part =>
    /united states|\busa?\b|\bu\.s\./i.test(part) || (!NON_US.test(part) && !CA_PROVINCE.test(part) && (US_RE.test(part) || /remote|anywhere/i.test(part))));
  if (where === 'custom') return places.some(p => loc.toLowerCase().includes(p.toLowerCase())) || (remote && places.some(p => /remote/i.test(p)));
  return true;
}

// One pass over every source, split into two lanes: full-time jobs and internships for students.
export async function searchJobs(prefs, extraBoards, onProgress) {
  const matchTitle = titleMatcher(prefs.roles);
  const matchIntern = internMatcher(prefs.roles);
  const exclude = prefs.exclude.map(s => s.toLowerCase()).filter(x => x && !INTERN_RE.test(x));
  const maxAge = prefs.ageDays * DAY;
  // Internship recruiting runs months ahead, so that lane looks back at least 90 days.
  const internAge = Math.max(prefs.ageDays, 90) * DAY;
  const common = (j, age) => !exclude.some(x => j.title.toLowerCase().includes(x)) && !(j.posted && Date.now() - j.posted > age) && locationOk(j, prefs.where, prefs.places);
  const keepJob = j => !isInternTitle(j.title) && (!prefs.roles.length || matchTitle(j.title)) && common(j, maxAge);
  const keepIntern = j => (j.id.startsWith('il-') || isInternTitle(j.title)) && matchIntern(j)
    && (prefs.gradStudent || !(GRAD_ONLY.test(j.title) || /\b(MS|M\.S\.|PhD)\b/.test(j.title) || j.degrees?.some(d => /phd|master/i.test(d)) && !j.degrees.some(d => /bachelor/i.test(d)))) && common(j, internAge);

  const boards = prefs.useAts ? [...COMPANIES, ...extraBoards] : extraBoards;
  const seen = new Set(), seenIntern = new Set();
  const jobs = [], interns = [];
  let done = 0, scanned = 0;
  const total = boards.length + (prefs.useRemote ? 1 : 0) + (prefs.useInterns ? 1 : 0);
  const tick = () => onProgress?.({ done: ++done, total, scanned, found: jobs.length, foundInterns: interns.length });
  const internKey = j => `${j.company}|${j.title}`.toLowerCase().replace(/\W+/g, '');
  const add = list => {
    scanned += list.length;
    for (const j of list) {
      if (seen.has(j.id)) continue;
      seen.add(j.id);
      if (keepJob(j)) jobs.push({ ...j, lane: 'job' });
      else if (keepIntern(j) && !seenIntern.has(internKey(j))) { seenIntern.add(internKey(j)); interns.push({ ...j, lane: 'intern' }); }
    }
  };

  await Promise.all([
    pool(boards, 14, async ([ats, slug]) => { try { add(await fetchBoard(ats, slug)); } finally { tick(); } }),
    prefs.useRemote ? remoteFeeds(prefs.roles).then(add).finally(tick) : null,
    prefs.useInterns ? internLists().then(add).finally(tick) : null,
  ]);

  // Some listings come without descriptions; fetch them for the newest matches only.
  const need = [...jobs, ...interns].filter(j => !j.descLoaded && /greenhouse|lever|ashby/.test(j.ats)).sort((a, b) => b.posted - a.posted).slice(0, 400);
  await pool(need, 12, j => loadDetail(j));
  const kws = prefs.keywords.map(k => k.toLowerCase());
  const hasKws = j => kws.every(k => `${j.title} ${j.desc}`.toLowerCase().includes(k));
  return { jobs: jobs.filter(hasKws), interns: kws.length ? interns.filter(j => !j.descLoaded || hasKws(j)) : interns, scanned };
}

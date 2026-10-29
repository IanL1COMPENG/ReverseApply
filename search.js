// Pulls openings straight from employer job boards and remote job feeds, then filters them.
import { COMPANIES } from './companies.js';
import { PATH_BY_ID } from './careers.js';

const DAY = 86400000;
const NAMES = { doordashusa: 'DoorDash', gleanwork: 'Glean', wizinc: 'Wiz', dbtlabsinc: 'dbt Labs', claylabs: 'Clay', andurilindustries: 'Anduril', scaleai: 'Scale AI', xai: 'xAI', openai: 'OpenAI', squareup: 'Square', hellofresh: 'HelloFresh', getyourguide: 'GetYourGuide', sumup: 'SumUp', n8n: 'n8n', deepl: 'DeepL', alephalpha: 'Aleph Alpha', elevenlabs: 'ElevenLabs', hackerone: 'HackerOne', workos: 'WorkOS', posthog: 'PostHog', planetscale: 'PlanetScale', cockroachlabs: 'Cockroach Labs', launchdarkly: 'LaunchDarkly', digitalocean: 'DigitalOcean', pagerduty: 'PagerDuty', newrelic: 'New Relic', mongodb: 'MongoDB', gitlab: 'GitLab', github: 'GitHub', hubspot: 'HubSpot', sofi: 'SoFi', clickup: 'ClickUp', runwayml: 'Runway', humeai: 'Hume AI', arizeai: 'Arize AI', grafanalabs: 'Grafana Labs', hudsonrivertrading: 'Hudson River Trading', janestreet: 'Jane Street', twosigma: 'Two Sigma', akunacapital: 'Akuna Capital', sig: 'SIG', imc: 'IMC', drw: 'DRW', appliedintuition: 'Applied Intuition', lucidmotors: 'Lucid Motors', warbyparker: 'Warby Parker', sentinelone: 'SentinelOne', crowdstrike: 'CrowdStrike', abnormalsecurity: 'Abnormal Security', '1password': '1Password', 'black-forest-labs': 'Black Forest Labs', isomorphiclabs: 'Isomorphic Labs', stabilityai: 'Stability AI', backmarket: 'Back Market', blablacar: 'BlaBlaCar', gocardless: 'GoCardless', truelayer: 'TrueLayer', jumpcloud: 'JumpCloud', shieldai: 'Shield AI', bayada: 'BAYADA', lifestance: 'LifeStance Health', charliehealth: 'Charlie Health', twochairs: 'Two Chairs', ayahealthcare: 'Aya Healthcare', ixllearning: 'IXL Learning', billcom: 'BILL', pilothq: 'Pilot', ww: 'WW (WeightWatchers)', hmgroup: 'H&M', accorhotel: 'Accor', codeforamerica: 'Code for America', charitywater: 'charity: water', achievementfirst: 'Achievement First', harlemvillageacademies: 'Harlem Village Academies', sagaeducation: 'Saga Education', workithealth: 'Workit Health', valerahealth: 'Valera Health', carrotfertility: 'Carrot Fertility', omadahealth: 'Omada Health', butterflynetwork: 'Butterfly Network', swordhealth: 'Sword Health', bicyclehealth: 'Bicycle Health', homelight: 'HomeLight', stockx: 'StockX', onemedical: 'One Medical', cloverhealth: 'Clover Health', mavenclinic: 'Maven Clinic', renttherunway: 'Rent the Runway', stitchfix: 'Stitch Fix', voxmedia: 'Vox Media', seatgeek: 'SeatGeek', classpass: 'ClassPass', godaddy: 'GoDaddy' };
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
  // Some boards append map coordinates: "Granada, MN 56039 | 43.67 | -94.32".
  location: (j.location?.name || '').replace(/\s*\|\s*-?\d+\.\d+/g, ''), posted: Date.parse(j.first_published || j.updated_at) || 0,
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

const fromSmartRecruiters = (slug, j) => ({
  id: `sr-${slug}-${j.id}`, ats: 'smartrecruiters', slug, jobId: j.id, company: j.company?.name || companyName(slug), title: j.name,
  location: (j.location?.fullLocation || [j.location?.city, j.location?.region].filter(Boolean).join(', ')) + (j.location?.remote ? ' (Remote)' : ''),
  posted: Date.parse(j.releasedDate) || 0, url: `https://jobs.smartrecruiters.com/${slug}/${j.id}`, applyUrl: `https://jobs.smartrecruiters.com/${slug}/${j.id}`,
  desc: '', descLoaded: false,
});
// SmartRecruiters boards can hold thousands of openings worldwide: take the newest 300 in the US.
async function smartRecruitersBoard(slug) {
  const out = [];
  for (let offset = 0; offset < 300; offset += 100) {
    const r = await getJson(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?country=us&limit=100&offset=${offset}`);
    out.push(...(r.content || []).map(j => fromSmartRecruiters(slug, j)));
    if (offset + 100 >= (r.totalFound || 0)) break;
  }
  return out;
}

async function fetchBoard(ats, slug) {
  const list = ats === 'greenhouse' ? (await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`)).jobs.map(j => fromGreenhouse(slug, j))
    : ats === 'lever' ? (await getJson(`https://api.lever.co/v0/postings/${slug}?mode=json`)).map(j => fromLever(slug, j))
    : ats === 'smartrecruiters' ? await smartRecruitersBoard(slug)
    : (await getJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}`)).jobs.filter(j => j.isListed !== false).map(j => fromAshby(slug, j));
  // How many openings the employer has is a rough size signal for the competition estimate.
  for (const j of list) j.boardSize = list.length;
  return list;
}

// ---------- full job descriptions ----------
// 1. Public hiring-system APIs (Greenhouse, Lever, Ashby, SmartRecruiters): instant and unlimited.
// 2. Everything else (Workday, iCIMS, Oracle, company career sites): the Jina Reader page reader,
//    which allows about 20 pages a minute per visitor for free, more with a free key.
// 3. Descriptions are cached in this browser for 14 days so repeat searches skip the network.
const ashbyBoards = {};

async function directDescription(job) {
  const u = job.url || '';
  let m;
  if (job.ats === 'greenhouse' && job.slug) return htmlToText((await getJson(`https://boards-api.greenhouse.io/v1/boards/${job.slug}/jobs/${job.jobId}`)).content);
  if ((m = u.match(/greenhouse\.io\/(?:embed\/job_app\?for=)?([\w-]+)(?:\/jobs\/|&token=)(\d+)/))) return htmlToText((await getJson(`https://boards-api.greenhouse.io/v1/boards/${m[1]}/jobs/${m[2]}`)).content);
  if ((m = u.match(/[?&]gh_jid=(\d+)/))) {
    // Company career sites that embed Greenhouse: the board name is usually the company name.
    const slug = (job.company || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    try { return htmlToText((await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${m[1]}`)).content); } catch { return null; }
  }
  if ((m = u.match(/jobs\.lever\.co\/([\w.-]+)\/([0-9a-f-]{36})/))) {
    const j = await getJson(`https://api.lever.co/v0/postings/${m[1]}/${m[2]}`);
    return [j.descriptionPlain, ...(j.lists || []).map(l => `${l.text}\n${htmlToText(l.content)}`), j.additionalPlain].filter(Boolean).join('\n');
  }
  if ((m = u.match(/jobs\.ashbyhq\.com\/([\w.%-]+)\/([0-9a-f-]{36})/))) {
    ashbyBoards[m[1]] ??= getJson(`https://api.ashbyhq.com/posting-api/job-board/${m[1]}`);
    const j = (await ashbyBoards[m[1]]).jobs.find(x => x.id === m[2]);
    return j ? j.descriptionPlain || htmlToText(j.descriptionHtml) : null;
  }
  if ((m = u.match(/smartrecruiters\.com\/([\w-]+)\/(\d{6,})/))) {
    const j = await getJson(`https://api.smartrecruiters.com/v1/companies/${m[1]}/postings/${m[2]}`);
    return Object.values(j.jobAd?.sections || {}).map(s => `${s.title || ''}\n${htmlToText(s.text)}`).join('\n');
  }
  return null;
}
export const hasDirectSource = job => /greenhouse|lever|ashby|smartrecruiters/.test(job.ats) || /gh_jid=|greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com/.test(job.url || '');

// Page reader with a shared rate limit (a sliding one-minute window) and backoff on 429.
const reader = { key: '', sent: [], pausedUntil: 0 };
export const setReaderKey = k => { reader.key = (k || '').trim(); };
const readerLimit = () => (reader.key ? 300 : 18);
async function readerSlot() {
  for (;;) {
    const now = Date.now();
    reader.sent = reader.sent.filter(t => now - t < 60000);
    if (now >= reader.pausedUntil && reader.sent.length < readerLimit()) { reader.sent.push(now); return; }
    const untilFree = now < reader.pausedUntil ? reader.pausedUntil - now : 60000 - (now - reader.sent[0]) + 50;
    await new Promise(r => setTimeout(r, Math.max(500, untilFree)));
  }
}
async function readPage(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await readerSlot();
    const r = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: 'application/json', 'X-Retain-Images': 'none', ...(reader.key ? { Authorization: `Bearer ${reader.key}` } : {}) },
      signal: AbortSignal.timeout(45000),
    });
    if (r.status === 429) { reader.pausedUntil = Date.now() + 20000 * (attempt + 1); continue; }
    if (!r.ok) return null;
    const text = (await r.json())?.data?.content || '';
    // Drop markdown links and images so only the posting's words are scored.
    return text.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\n{3,}/g, '\n\n').trim() || null;
  }
  return null;
}

// Tiny IndexedDB cache: url -> { desc, at }.
const CACHE_DAYS = 14;
let dbp = null;
const db = () => (dbp ??= new Promise(res => {
  try {
    const req = indexedDB.open('reverseapply', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('desc');
    req.onsuccess = () => res(req.result);
    req.onerror = () => res(null);
  } catch { res(null); }
}));
async function cacheGet(url) {
  const d = await db();
  if (!d) return null;
  return new Promise(res => {
    const q = d.transaction('desc').objectStore('desc').get(url);
    q.onsuccess = () => res(q.result && Date.now() - q.result.at < CACHE_DAYS * 864e5 ? q.result.desc : null);
    q.onerror = () => res(null);
  });
}
async function cachePut(url, desc) {
  const d = await db();
  if (d) try { d.transaction('desc', 'readwrite').objectStore('desc').put({ desc: desc.slice(0, 12000), at: Date.now() }, url); } catch { /* quota */ }
}

// Fills job.desc from the cache, a public API, or (with useReader) the page reader.
export async function loadDetail(job, { useReader = true } = {}) {
  if (job.descLoaded) return job;
  let desc = await cacheGet(job.url);
  if (!desc && hasDirectSource(job)) desc = await directDescription(job).catch(() => null);
  if (!desc && useReader && job.url) desc = await readPage(job.url).catch(() => null);
  if (desc && desc.length > 80) {
    job.desc = desc;
    job.descLoaded = true;
    cachePut(job.url, desc);
  } else if (useReader) job.readFailed = true;
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

// The Muse: one public feed covering every field (healthcare, education, accounting, marketing, HR, legal,
// hospitality, trades...), with full descriptions included. About 500 requests an hour per visitor.
// Its pages are not in date order and many listings are old, so the search keeps only recent ones.
const MUSE = 'https://www.themuse.com/api/public/jobs';
const fromMuse = j => ({
  id: `mu-${j.id}`, ats: 'the muse', company: j.company?.name || '', title: j.name || '',
  location: (j.locations || []).map(l => l.name).join(' / '), posted: Date.parse(j.publication_date) || 0,
  url: j.refs?.landing_page || '', applyUrl: j.refs?.landing_page || '', desc: htmlToText(j.contents), descLoaded: true,
  category: (j.categories || []).map(c => c.name).join(', '), levels: (j.levels || []).map(l => l.name), museField: true,
});
async function museFeed(categories, { interns, pages = 8 }) {
  if (!categories.length) return [];
  const q = categories.map(c => `category=${encodeURIComponent(c)}`).join('&') + (interns ? '&level=Internship' : '');
  const out = [];
  await pool(Array.from({ length: pages }, (_, i) => i), 4, async p => {
    try { out.push(...((await getJson(`${MUSE}?${q}&page=${p}`)).results || []).map(fromMuse)); } catch { /* keep the pages that worked */ }
  });
  return out;
}

// Turns pasted board links into [ats, slug] pairs.
export function parseBoardLinks(text) {
  const out = [];
  for (const m of (text || '').matchAll(/(greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com)\/(?:embed\/job_board\?for=|v1\/boards\/)?([A-Za-z0-9_.-]+)/g)) {
    out.push([m[1].startsWith('green') ? 'greenhouse' : m[1].startsWith('lever') ? 'lever' : m[1].startsWith('smart') ? 'smartrecruiters' : 'ashby', m[2]]);
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
// Internship-list categories a role clearly belongs to. Whole words only: "ai" must never match inside "email".
const CATEGORY_HINTS = [
  [/\b(software|developer|web|frontend|front end|backend|back end|full.?stack|mobile|swe)\b/, /software/i],
  [/\b(data|data science|machine learning|ml|ai|artificial intelligence)\b/, /data|\bai\b|\bml\b/i],
  [/\b(hardware|electrical|embedded|firmware|chip|robotics?)\b/, /hardware/i],
  [/\bproduct (manager|management|owner|design)\b/, /product/i],
  [/\b(quant|quantitative|trading)\b/, /quant/i],
];
// "marketing" ~ "Marketing", "finance" ~ "Financial": drop a common ending, then match from a word start.
const stemOf = w => { const s = w.replace(/(ing|ers|er|ial|ics|ical|ist|s|e)$/, ''); return s.length >= 4 ? s : w; };

// Which target role an internship matches, and how closely:
//   exact    - the title is that role ("software engineer" -> "Software Engineering Intern")
//   field    - every key word of the role is in the title ("data analyst" -> "Data Science Intern")
//   category - the internship list files it under that role's category
// Returns null when it matches none of the roles.
export function internMatcher(roles, paths = []) {
  const cleaned = roles.map(r => r.replace(INTERN_RE, '').trim()).filter(Boolean);
  if (!cleaned.length) return () => ({ role: '', kind: 'any' });
  const fieldHit = job => pathFits(job, paths);
  const parts = cleaned.map(role => ({
    role,
    exact: titleMatcher([role]),
    words: role.toLowerCase().split(/[\s/,-]+/).filter(w => w.length > 1 && !STOP.has(w) && !GENERIC.has(w)).map(stemOf),
    cats: CATEGORY_HINTS.filter(([re]) => re.test(role.toLowerCase())).map(([, cat]) => cat),
  }));
  return job => {
    const t = job.title;
    const hit = kind => parts.find(p =>
      kind === 'exact' ? p.exact(t)
        : kind === 'field' ? p.words.length && p.words.every(w => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(t))
          : job.category && p.cats.some(c => c.test(job.category)));
    for (const kind of ['exact', 'field', 'category']) { const p = hit(kind); if (p) return { role: p.role, kind }; }
    // An all-industry listing in the resume's own career path ("Staff Accountant" for an accounting major).
    if (fieldHit(job)) return { role: cleaned[0], kind: 'category', path: fieldPath(job, paths)?.label };
    return null;
  };
}

// Does this listing belong to one of the resume's career paths? Its title must name that path's kind of work,
// so a "Registered Nurse" posting never reaches an accounting student just because both are "Healthcare".
export function pathFits(job, paths = []) {
  return !!(job.museField && paths?.length && fieldPath(job, paths));
}
const fieldPath = (job, paths) => paths.map(id => PATH_BY_ID[id]).find(p => p?.title.test(job.title));

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
  const paths = prefs.paths || [];
  const matchIntern = internMatcher(prefs.roles, paths);
  const exclude = prefs.exclude.map(s => s.toLowerCase()).filter(x => x && !INTERN_RE.test(x));
  const maxAge = prefs.ageDays * DAY;
  // Internship recruiting runs months ahead, so that lane looks back at least 90 days.
  const internAge = Math.max(prefs.ageDays, 90) * DAY;
  const common = (j, age) => !exclude.some(x => j.title.toLowerCase().includes(x)) && !(j.posted && Date.now() - j.posted > age) && locationOk(j, prefs.where, prefs.places);
  // The all-industry feed posts few listings per day per field, so it looks back at least 45 days.
  const keepJob = j => !isInternTitle(j.title) && !j.levels?.includes('Internship') && (!prefs.roles.length || matchTitle(j.title) || pathFits(j, paths)) && common(j, j.museField ? Math.max(maxAge, 45 * DAY) : maxAge);
  const keepIntern = j => (j.id.startsWith('il-') || isInternTitle(j.title) || j.levels?.includes('Internship')) && matchIntern(j)
    && (prefs.gradStudent || !(GRAD_ONLY.test(j.title) || /\b(MS|M\.S\.|PhD)\b/.test(j.title) || j.degrees?.some(d => /phd|master/i.test(d)) && !j.degrees.some(d => /bachelor/i.test(d)))) && common(j, internAge);

  const boards = prefs.useAts ? [...COMPANIES, ...extraBoards] : extraBoards;
  const seen = new Set(), seenIntern = new Set();
  const jobs = [], interns = [];
  let done = 0, scanned = 0;
  const cats = prefs.useMuse === false ? [] : prefs.museCats || [];
  const total = boards.length + (prefs.useRemote ? 1 : 0) + (prefs.useInterns ? 1 : 0) + (cats.length ? 2 : 0);
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
    cats.length ? museFeed(cats, { interns: false, pages: 15 }).then(add).catch(() => {}).finally(tick) : null,
    cats.length && prefs.useInterns ? museFeed(cats, { interns: true, pages: 5 }).then(add).catch(() => {}).finally(tick) : cats.length ? tick() : null,
  ]);

  // Fill descriptions from the cache and the public APIs now; the page reader runs afterwards in the background.
  const need = [...jobs, ...interns].filter(j => !j.descLoaded).sort((a, b) => b.posted - a.posted).slice(0, 2500);
  onProgress?.({ done, total, scanned, found: jobs.length, foundInterns: interns.length, phase: `Reading ${need.length} job descriptions` });
  await pool(need, 16, j => loadDetail(j, { useReader: false }));
  const kws = prefs.keywords.map(k => k.toLowerCase());
  const hasKws = j => kws.every(k => `${j.title} ${j.desc}`.toLowerCase().includes(k));
  return { jobs: jobs.filter(hasKws), interns: kws.length ? interns.filter(j => !j.descLoaded || hasKws(j)) : interns, scanned };
}

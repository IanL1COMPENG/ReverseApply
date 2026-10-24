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
  if (ats === 'greenhouse') return (await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`)).jobs.map(j => fromGreenhouse(slug, j));
  if (ats === 'lever') return (await getJson(`https://api.lever.co/v0/postings/${slug}?mode=json`)).map(j => fromLever(slug, j));
  return (await getJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}`)).jobs.filter(j => j.isListed !== false).map(j => fromAshby(slug, j));
}

export async function loadGreenhouseDetail(job) {
  if (job.descLoaded) return job;
  const j = await getJson(`https://boards-api.greenhouse.io/v1/boards/${job.slug}/jobs/${job.jobId}`);
  job.desc = htmlToText(j.content);
  job.descLoaded = true;
  return job;
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

const US_STATES = 'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' ');
const US_RE = new RegExp(`united states|\\busa?\\b|\\bu\\.s\\.|,\\s?(${US_STATES.join('|')})\\b|new york|san francisco|seattle|austin|boston|chicago|los angeles|denver|atlanta|miami|washington|bay area|silicon valley|remote - us|north america|americas`, 'i');

// Remote roles tied to another country don't count as US.
const NON_US = /europe|emea|\buk\b|united kingdom|london|germany|berlin|munich|hamburg|india|bangalore|bengaluru|canada|toronto|vancouver|latam|apac|brazil|poland|spain|madrid|barcelona|france|paris|netherlands|amsterdam|switzerland|zurich|zug|austria|vienna|ireland|dublin|portugal|lisbon|italy|sweden|stockholm|denmark|copenhagen|norway|finland|israel|tel aviv|singapore|japan|tokyo|australia|sydney|mexico|argentina|colombia|philippines|nigeria|kenya|south africa|dubai|uae/i;

export function locationOk(job, where, places) {
  const loc = `${job.location} ${job.title}`;
  const remote = /remote|anywhere|distributed|work from home/i.test(loc);
  if (where === 'remote') return remote;
  if (where === 'us') return US_RE.test(loc) || (remote && !NON_US.test(loc));
  if (where === 'custom') return places.some(p => loc.toLowerCase().includes(p.toLowerCase())) || (remote && places.some(p => /remote/i.test(p)));
  return true;
}

export async function searchJobs(prefs, extraBoards, onProgress) {
  const matchTitle = titleMatcher(prefs.roles);
  const exclude = prefs.exclude.map(s => s.toLowerCase()).filter(Boolean);
  const maxAge = prefs.ageDays * DAY;
  const keep = j => {
    const t = j.title.toLowerCase();
    if (prefs.roles.length && !matchTitle(j.title)) return false;
    if (exclude.some(x => t.includes(x))) return false;
    if (j.posted && Date.now() - j.posted > maxAge) return false;
    return locationOk(j, prefs.where, prefs.places);
  };

  const boards = prefs.useAts ? [...COMPANIES, ...extraBoards] : extraBoards;
  const seen = new Set();
  const results = [];
  let done = 0, scanned = 0;
  const total = boards.length + (prefs.useRemote ? 1 : 0);
  const tick = () => onProgress?.({ done: ++done, total, scanned, found: results.length });
  const add = jobs => { scanned += jobs.length; for (const j of jobs) if (!seen.has(j.id) && keep(j)) { seen.add(j.id); results.push(j); } };

  await Promise.all([
    pool(boards, 14, async ([ats, slug]) => { try { add(await fetchBoard(ats, slug)); } finally { tick(); } }),
    prefs.useRemote ? remoteFeeds(prefs.roles).then(add).finally(tick) : null,
  ]);

  // Greenhouse lists come without descriptions; fetch them for the matches only.
  const need = results.filter(j => !j.descLoaded).sort((a, b) => b.posted - a.posted).slice(0, 250);
  await pool(need, 10, loadGreenhouseDetail);
  if (prefs.keywords.length) {
    const kws = prefs.keywords.map(k => k.toLowerCase());
    return { jobs: results.filter(j => kws.every(k => `${j.title} ${j.desc}`.toLowerCase().includes(k))), scanned };
  }
  return { jobs: results, scanned };
}

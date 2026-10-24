// Rates a job 1.0–5.0 for one candidate, with the reasons behind the number.
import { skillWeights, pretty } from './skills.js';
import { titleMatcher, internMatcher } from './search.js';
import { companyTier, TIER_LABEL } from './companies-tiers.js';
import { requirementFit } from './reqs.js';

const LEVELS = ['Internship', 'Entry level', 'Mid level', 'Senior', 'Staff / Lead', 'Director+'];

export function jobLevel(title, desc = '') {
  const t = title.toLowerCase();
  if (/\b(intern|internship|co-op|apprentice)\b/.test(t)) return 0;
  if (/\b(vp|vice president|director|head of|chief)\b/.test(t)) return 5;
  if (/\b(staff|principal|distinguished|lead|manager)\b/.test(t)) return 4;
  if (/\b(senior|sr\.?|iii)\b/.test(t)) return 3;
  if (/\b(junior|jr\.?|entry|new grad|graduate|associate|early career|i)\b/.test(t)) return 1;
  const yrs = requiredYears(desc);
  if (yrs !== null) return yrs <= 1 ? 1 : yrs <= 3 ? 2 : yrs <= 6 ? 3 : 4;
  return 2;
}

export function requiredYears(desc) {
  const m = [...desc.matchAll(/(\d{1,2})\s*\+?\s*(?:-\s*\d+\s*)?years?(?:'|’)?\s+(?:of\s+)?(?:\w+\s+){0,4}?(?:experience|exp\b)/gi)].map(x => +x[1]).filter(n => n < 20);
  return m.length ? Math.min(...m) : null;
}

export function candidateLevel(years, pref) {
  const map = { intern: 0, entry: 1, mid: 2, senior: 3 };
  if (pref in map) return map[pref];
  return years < 1 ? 1 : years < 3 ? 1.5 : years < 6 ? 2.5 : years < 9 ? 3.2 : 4;
}

export function scoreJob(job, resume, prefs) {
  const text = `${job.title}\n${job.desc}`;
  const reasons = [];
  const flags = [];

  const hitRole = prefs.roles.find(r => titleMatcher([r])(job.title));
  const roleHit = !prefs.roles.length || !!hitRole;
  const major = degreeFit(job, resume, { student: false });
  const title = Math.min(roleHit ? 1 : 0.45, major.fit);
  if (hitRole) reasons.push(`Matches your target role "${hitRole}"`);
  else if (prefs.roles.length) flags.push(`Not one of your target roles (${prefs.roles.join(', ')})`);
  reasons.push(...major.reasons); flags.push(...major.flags);

  const { skills: keywordSkills, matched, missing, want } = skillFit(text, job, resume);
  if (want.length >= 3) reasons.push(`You have ${matched.length} of ${want.length} skills it asks for`);
  const req = reqCheck(job, resume, keywordSkills);
  const skills = req.skills;
  reasons.push(...req.reasons); flags.push(...req.flags);

  const jl = jobLevel(job.title, job.desc);
  const cl = candidateLevel(resume.years, prefs.level);
  const gap = jl - cl;
  let seniority = gap <= 0 ? Math.max(0.35, 1 - Math.abs(gap) * 0.25) : Math.max(0, 1 - gap * 0.4);
  const yrs = requiredYears(job.desc || '');
  if (yrs !== null && prefs.level !== 'intern' && yrs > resume.years + 2) { seniority = Math.min(seniority, 0.3); flags.push(`Asks for ${yrs}+ years, you show about ${resume.years}`); }
  reasons.push(`${LEVELS[Math.round(jl)]} role`);

  const ageDays = job.posted ? (Date.now() - job.posted) / 86400000 : 30;
  const fresh = ageDays < 2 ? 1 : ageDays < 7 ? 0.8 : ageDays < 14 ? 0.6 : 0.4;
  if (ageDays < 2) reasons.push('Posted in the last 48 hours: early applicants get seen first');

  const exp = fieldExperience(job, resume, want, { student: false, needYears: yrs ?? [0, 0, 2, 5, 7, 10][Math.round(jl)] });
  reasons.push(...exp.reasons); flags.push(...exp.flags);
  const comp = competition(job, resume, { exp: exp.score, skills });
  reasons.push(...comp.reasons); flags.push(...comp.flags);

  const raw = 0.2 * title + 0.3 * skills + 0.25 * exp.score + 0.15 * seniority + 0.05 + 0.05 * fresh;
  // For full-time roles, solid related work experience can stand in for the "right" degree.
  let score = Math.min(exp.score >= 0.6 ? 5 : major.cap, roleHit ? 5 : 2.8, req.cap, 1 + 4 * raw - comp.penalty);

  if (prefs.needsSponsor && /(no|not|unable to|cannot|won't|will not)\s+(provide\s+|offer\s+)?(visa\s+)?sponsor/i.test(job.desc)) { score = Math.min(score, 1.8); flags.push('Says it will not sponsor visas'); }
  if (/(security|secret|ts\/sci) clearance (is )?required|active (secret|ts\/sci|top secret)/i.test(job.desc) && !/clearance/i.test(resume.text)) { score = Math.min(score, 2.4); flags.push('Requires a security clearance'); }
  if (!job.descLoaded) flags.push(titleOnlyNote(job));

  score = Math.round(Math.min(5, Math.max(1, score)) * 10) / 10;
  return {
    score, matched, missing: missing.slice(0, 15),
    parts: { title, skills, experience: exp.score, seniority, odds: comp.odds, fresh },
    reasons, flags, tier: comp.tier, related: exp.related, reqs: req.summary,
    verdict: score >= 4.5 ? 'Apply now' : score >= 4 ? 'Strong fit, apply' : score >= 3 ? 'Possible, only with a reason' : 'Skip',
    label: matched.slice(0, 5).map(pretty).join(', '),
  };
}

function skillFit(text, job, resume) {
  const weights = skillWeights(text);
  const want = Object.keys(weights);
  const have = new Set(resume.skills);
  const matched = want.filter(s => have.has(s));
  const missing = want.filter(s => !have.has(s)).sort((a, b) => weights[b] - weights[a]);
  const totalW = want.reduce((a, s) => a + weights[s], 0);
  const gotW = matched.reduce((a, s) => a + weights[s], 0);
  let skills = want.length >= 3 ? Math.min(1, Math.pow(gotW / totalW, 0.75) * 1.08) : 0.65;
  if (!job.descLoaded) skills = 0.6;
  return { skills, matched, missing, want };
}

const titleOnlyNote = job => job.readFailed
  ? 'Scored on title only: this site blocks automatic reading, so open the posting to check it'
  : 'Scored on title only so far: the full posting is being read in the background';

// "Minimum: Master or PhD graduate candidates", "must be pursuing a PhD": a sentence that requires a graduate
// degree and never mentions undergraduates.
function gradOnlyText(desc = '') {
  return desc.split(/(?<=[.!?\n])\s+/).some(s =>
    /\b(minimum|must|required|only|currently (enrolled|pursuing)|pursuing)\b/i.test(s) && /\b(master'?s?|m\.s\.|ph\.?\s?d|doctoral|graduate (student|candidate|degree)s?)\b/i.test(s)
    && !/\b(bachelor'?s?|b\.?s\.?|b\.?a\.?|undergrad\w*|or above|or higher)\b/i.test(s));
}

// ---------- class year: freshman / sophomore / junior / senior ----------
const YEARS = ['freshman', 'sophomore', 'junior', 'senior'];
const PLURAL = { freshman: 'freshmen', sophomore: 'sophomores', junior: 'juniors', senior: 'seniors', grad: 'graduate students' };
const MONTH_NUM = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12, spring: 5, summer: 8, fall: 12, autumn: 12, winter: 12 };
// Graduation as a fractional year ("December 2028" -> 2028.92). No month written: assume May.
function gradPoint(edu) {
  if (!edu.gradYear) return null;
  const word = ((edu.gradDate || '').toLowerCase().match(/[a-z]+/) || [''])[0];
  return edu.gradYear + ((MONTH_NUM[word] ?? MONTH_NUM[word.slice(0, 3)] ?? 5) - 1) / 12;
}
// Class year at a point in time: under 1 year to go = senior, 1-2 = junior, 2-3 = sophomore, more = freshman.
function standingAt(t, grad) {
  const left = grad - t;
  if (left <= 0) return 'graduated';
  return YEARS[Math.max(0, 4 - Math.ceil(left))];
}
const nowPoint = () => { const d = new Date(); return d.getFullYear() + d.getMonth() / 12; };
// When the internship starts: "Summer 2027" -> June 2027; no term given -> next June. A listing still tagged
// with a term that already ended (a reposted "Summer 2026" in October 2026) means the next one.
function termPoint(job) {
  const n = nowPoint();
  const m = `${job.term || ''} ${job.title}`.match(/\b(spring|summer|fall|autumn|winter)\s+(20\d{2})\b/i);
  if (m) {
    let t = +m[2] + { spring: 0, winter: 0, summer: 5 / 12, fall: 8 / 12, autumn: 8 / 12 }[m[1].toLowerCase()];
    while (t + 3 / 12 < n) t += 1;
    return t;
  }
  return Math.floor(n) + (n % 1 < 5 / 12 ? 0 : 1) + 5 / 12;
}
// "third", "3rd", "final" and "penultimate" (of a four-year degree) as class years.
const ORDINAL = { first: 0, '1st': 0, second: 1, '2nd': 1, third: 2, '3rd': 2, fourth: 3, '4th': 3, final: 3, last: 3, penultimate: 2, prefinal: 2, 'pre-final': 2 };
const levelOf = w => { const x = w.toLowerCase().replace(/[- ]year$/, ''); return YEARS.find(y => x.startsWith(y.slice(0, 5))) || YEARS[ORDINAL[x]]; };
const CW = String.raw`(?:freshm[ae]n|sophomores?|juniors?|seniors?|(?:first|second|third|fourth|final|last|penultimate|pre-?final|1st|2nd|3rd|4th)(?:[- ]year)?)`;
const GROUP_RE = new RegExp(String.raw`\b${CW}\b(?:(?:\s*[,\/&]\s*(?:(?:and|or|as well as)\s+)?|\s+(?:and|or|as well as)\s+)${CW}\b)*`, 'gi');
// Words after "senior"/"junior" that make it a job level, not a class year ("senior engineers", "junior developer").
const ROLE_AFTER = /^[\s-]*(?:(?:software|data|product|research|hardware|business|level)\s+)?(?:engineers?|developers?|managers?|mentors?|leaders?|leadership|staff|scientists?|analysts?|executives?|directors?|vice|vp|associates?|consultants?|designers?|professionals?|team|members?|partners?|colleagues|management|roles?|positions?|interns?|internships?|citizens|living|care|centers?|technicians?|specialists?|architects?|counsel|advisors?|officers?|accountants?|recruiters?|quants?|traders?|researchers?|programmers?|devs?|swes?|ics?|people|folks|employees|peers|coworkers|thesis|design|project)\b/i;
const ORD_NOT_SCHOOL = /^\s*(?:[- ]?year\s+)?(?:of (?:the |our |this )?(?:program|programme|role|internship|fellowship|service|employment|operations?|business)|in a row|consecutive|running)\b/i;
const ACCEPT_AFTER = /^(?:[- ](?:year|level)\b|\s+(?:standing|class|students?|undergrad\w*|majors?|majoring|pursuing|year|coursework|courses|results|in (?:college|school|university|their|an?|the)\b|of (?:study|school|college|university|undergrad\w*|(?:your |their |an? |the )?(?:bachelor|degree|undergrad|engineering|university|college|studies)|[\w'’]+ (?:courses|coursework|degree|program))))/i;
const HEAD_CUE = /(?:\b(?:an?|current(?:ly)?(?: an?)?|college|undergrad(?:uate)?s?|rising|entering|heading into|going into|incoming|at least(?: an?)?|minimum(?: of)?|be(?: an?)?|as(?: an?)?|level:?|their|your|complet(?:ion|ed)(?: of)?|obtained|for)\s*\(?)$/i;
const RISING_HEAD = /\b(?:rising|entering|heading into|going into|incoming|will be)\s+(?:(?:their|your|the|an?|undergrad(?:uate)?|college|at least)\s+){0,2}$/i;
const COMPLETED_HEAD = /\b(?:complet(?:ion|ed)|finish(?:ed)?)\s+(?:of\s+)?(?:at least\s+)?(?:(?:their|your|the|an?|undergrad(?:uate)?|college)\s+){0,2}$/i;
const AT_LEAST_HEAD = /\b(?:at least|minimum(?: of)?|obtained)\s+(?:an?\s+|the\s+)?(?:rising\s+)?$/i;
const GRAD_TOO = /\b(?:grad(?:uate)? students?|grad student|master['’]?s(?:\s+(?:students?|program|candidates?|level))|ms[- ]level|ph\.?\s?d\.?\s+(?:students?|candidates?)|mba students?|(?:pursuing|enrolled in|working toward)\s+an?\s+(?:advanced|graduate|master['’]?s|ph\.?\s?d))\b/i;
// Which class years a posting accepts. "Juniors and seniors" means students in that year now (while applying);
// "rising juniors" / "entering their junior year" means students who will be juniors once the internship ends.
// Only counts sentences about students, so "work with senior engineers" is ignored.
function acceptedYears(desc = '') {
  // "Open to all class years" lifts the limit; "employees of all levels" is about the company, not students.
  if (/\b(?:all|any) class years?\b|\bfreshm[ae]n through seniors\b|\bany year of (?:study|school|college)\b|\bstudents (?:at|in|of|from) (?:all|any) (?:academic |class )?(?:levels|years|stages)\b|\b(?:all|any) (?:academic )?(?:years|levels|stages) of (?:study|school|college|undergrad\w*)\b|\bstudents at any stage\b/i.test(desc)) return [];
  const out = [], excluded = [];
  for (const s of desc.split(/(?<=[.!?\n•;])\s+/)) {
    if (!/\b(students?|undergrad\w*|college|university|universities|enrolled|pursuing|degree|school|study|studies|coursework|courses|standing|candidates?|applicants?|majoring|program\w*|internships?|level|class|open to|eligible|intended for|reserved for|complet\w*|studying|current(?:ly)?|prefer\w*|welcome|encouraged|apply|considered|must|required|(?:freshman|sophomore|junior|senior) year|upperclass\w*|underclass\w*)\b/i.test(s)) continue;
    // Pay tables ("Intern/Junior/Senior: $34 per hour") list rates, not who may apply.
    if (/\$\s?\d|\bper hour\b|\/\s?hr\b|\bhourly\b/i.test(s)) continue;
    // "Upperclassmen are preferred" is a preference, not a rule.
    const preferred = /\b(prefer\w*|ideal\w*|desired|a plus|nice to have)\b/i.test(s);
    const before = out.length;
    if (/\bupperclass\w*/i.test(s)) out.push({ level: 'junior' }, { level: 'senior' });
    if (/\bunderclass\w*/i.test(s)) out.push({ level: 'freshman' }, { level: 'sophomore' });
    // A run of class years: "junior or senior", "Sophomore, Junior, or Senior", "Final or Penultimate year", "2nd or 3rd year".
    for (const m of s.matchAll(GROUP_RE)) {
      const g = m[0], head = s.slice(Math.max(0, m.index - 45), m.index), tail = s.slice(m.index + g.length, m.index + g.length + 60);
      const words = g.match(new RegExp(CW, 'gi'));
      const named = /freshm|sophomore|junior|senior/i.test(g);
      if (!named && !/year/i.test(g) && !/^[- ]year\b/i.test(tail)) continue; // "first week", "final internship"
      if (ROLE_AFTER.test(tail) || (!named && ORD_NOT_SCHOOL.test(tail))) continue; // "senior engineers", "3rd year in a row"
      if (!(/freshmen|sophomores|juniors|seniors/i.test(g) || words.length > 1 || ACCEPT_AFTER.test(tail) || HEAD_CUE.test(head))) continue;
      // "second-year Ph.D.", "Rising senior or second-year graduate student": that ordinal is about grad school.
      if (/^\s*(?:[- ]?year\s+)?(?:of\s+(?:an?\s+|their\s+|your\s+)?)?(?:ph\.?\s?d|doctoral|graduate|master|ms\b|mba)/i.test(tail) && !/freshm|sophomore|junior|senior/i.test(words[words.length - 1])) {
        words.pop(); out.push({ level: 'grad' });
        if (!words.length) continue;
      }
      const idx = [...new Set(words.map(w => YEARS.indexOf(levelOf(w))).filter(i => i >= 0))];
      if (!idx.length) continue;
      const rising = RISING_HEAD.test(head);
      if (COMPLETED_HEAD.test(head) || /^[^.;]{0,40}\b(?:completed|results)\b/i.test(tail)) {
        // "Completion of junior year": done with that year by the internship, so a rising senior or later.
        for (let j = Math.max(...idx) + 1; j < 4; j++) out.push({ level: YEARS[j], rising: true });
        out.push({ level: 'grad' });
      } else if (AT_LEAST_HEAD.test(head) || /^\s+standing\b/i.test(tail) || /^[^.;]{0,30}\b(?:or (?:above|higher|later|beyond|more|greater)|and (?:above|up|beyond))\b/i.test(tail)) {
        // "at least a junior", "junior standing", "junior level or above": that year or later.
        for (let j = Math.min(...idx); j < 4; j++) out.push({ level: YEARS[j], rising });
        out.push({ level: 'grad' });
      } else idx.forEach(j => out.push({ level: YEARS[j], rising }));
    }
    // "must have completed at least 2 years of your degree": a rising junior or later.
    const done = s.match(/\bcompleted (?:at least )?(one|two|three|1|2|3) (?:full[- ]time )?(?:academic )?years?\b/i);
    if (done) { for (let j = { one: 1, two: 2, three: 3 }[done[1].toLowerCase()] ?? +done[1]; j < 4; j++) out.push({ level: YEARS[j], rising: true }); out.push({ level: 'grad' }); }
    // "...or students pursuing an advanced degree", "junior, senior, or MS-level student": graduate students are accepted too.
    if (out.length > before && GRAD_TOO.test(s)) out.push({ level: 'grad' });
    for (let i = before; i < out.length; i++) { out[i].rising ??= false; out[i].preferred = preferred; }
    // "Freshmen, sophomores, and seniors will not be considered" names who is left out.
    if (out.length > before && /\bnot (?:be )?(?:considered|eligible|accepted)\b|\bineligible\b|\bexcluded\b|\bcannot apply\b/i.test(s)) excluded.push(...out.splice(before));
  }
  // "Graduate students working on their master's degree will also be considered" in its own sentence.
  if (out.length && /\b(?:graduate|master['’]?s|ph\.?\s?d) students?\b[^.]{0,60}\b(?:also|will be)\s+(?:be\s+)?(?:considered|eligible|welcome)/i.test(desc)) out.push({ level: 'grad', rising: false });
  if (excluded.length) {
    const out2 = out.length ? out : YEARS.map(level => ({ level, rising: false, preferred: false }));
    return out2.filter(o => o.level && !excluded.some(x => x.level === o.level));
  }
  return out.filter(o => o.level);
}

// Do you fit the class years the posting names? Graduation years named in the posting take priority.
function classFit(job, edu, gradYearMatches) {
  const grad = gradPoint(edu);
  const wanted = acceptedYears(job.desc);
  if (!grad || !wanted.length) return null;
  const nowYear = standingAt(nowPoint(), grad);
  const risingYear = standingAt(termPoint(job) + 3 / 12, grad);
  const ok = wanted.some(w => (w.level === 'grad' ? !!edu.gradStudent : w.level === (w.rising ? risingYear : nowYear)));
  const label = [...new Set(wanted.map(w => `${w.rising ? 'rising ' : ''}${PLURAL[w.level]}`))].join(', ').replace(/, ([^,]*)$/, ' and $1');
  const when = job.term ? job.term.split(',')[0] : 'the internship';
  const you = [
    wanted.some(w => !w.rising) && (nowYear === 'graduated' ? "you've graduated" : `you're a ${nowYear} now`),
    wanted.some(w => w.rising) && (risingYear === 'graduated' ? `you'll have graduated by ${when}` : `you'll be a rising ${risingYear} by ${when}`),
  ].filter(Boolean).join(' and ');
  if (ok) return { ok: true, text: `Open to ${label}: ${you}, so you qualify` };
  if (gradYearMatches) return { ok: true, text: `Says ${label}, but its graduation dates include yours (${edu.gradDate || edu.gradYear})` };
  if (wanted.every(w => w.preferred)) return { ok: false, preferred: true, text: `Prefers ${label}; ${you}` };
  return { ok: false, text: `Only for ${label}; ${you} (graduating ${edu.gradDate})` };
}

// ---------- graduation-date rules ----------
// "graduation" as a noun or verb, not "graduate students" / "graduate program"; plus wording that names a degree date.
const GRAD_CUE = /(?:\bgraduat(?!e\s+(?:students?|programs?|programmes?|roles?|positions?|degrees?|level|school|studies|research|courses?|interns?\w*|opportunit\w*|recruit\w*|schemes?|jobs?|talent|assistants?|fellows?|candidates?))\w*|\bgrad(?:uation)?\s+(?:date|year|term)|\bclass of\b|\bdegree\s+(?:expected|completion|conferral|by)\b|\b(?:complet|obtain|earn|receiv|finish|conferr)\w*\s+(?:(?:your|their|a|an|the)\s+)?(?:[\w'’]+\s+){0,3}degree\b|\bexpected\s+(?:date|to\s+(?:be\s+ready|graduat|complet|finish|receiv|obtain|earn))|\bready for full[- ]time|\breturning to (?:full[- ]time )?(?:education|school|university|studies))/i;
const MONTH_RE = String.raw`(?:jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?|spring|summer|fall|autumn|winter`;
const BEFORE_YEAR = new RegExp(String.raw`\b((?:${MONTH_RE})(?:\s*(?:\/|,|or|&|and)\s*(?:${MONTH_RE}))*)(?:\s+of)?(?:\s+the)?[\s,]*(?:\d{1,2}(?:st|nd|rd|th)?,?\s*)?$`, 'i');
const monthOf = w => MONTH_NUM[w.toLowerCase()] ?? MONTH_NUM[w.slice(0, 3).toLowerCase()];
const TOL = 1.5 / 12; // "Spring 2028" vs "May 2028", "Winter 2027" vs "December 2027"
// Every date in a phrase as a fractional year; a bare year covers all of it. "Dec 2026 - 2028" -> Dec 2026 .. Dec 2028.
function datePoints(text, now) {
  const pts = [];
  for (const m of text.matchAll(/\b(20\d{2})\b/g)) {
    const y = +m[1];
    if (y < now - 1 || y > now + 7) continue;
    const mm = text.slice(0, m.index).match(BEFORE_YEAR);
    const months = mm ? mm[1].match(/[a-z]+/gi).map(monthOf).filter(Boolean) : [];
    if (months.length) months.forEach(n => pts.push(y + (n - 1) / 12));
    else pts.push(y, y + 11 / 12);
  }
  return pts;
}
// The graduation dates a posting accepts, from wording like "graduating between December 2027 and June 2028",
// "December 2027 or later", "by Spring 2029", "2027 or 2028", "will consider 2029 graduates", and
// "must be returning to school after the internship". Returns null when it names none.
function gradRule(job, edu) {
  const now = new Date().getFullYear();
  const g = gradPoint(edu);
  if (!g) return null;
  const end = termPoint(job) + 3 / 12; // when the internship is over
  const wins = [], musts = [];
  const desc = (job.desc || '').replace(/&amp;/g, '&').replace(/&nbsp;|&#xa0;| /g, ' ');
  for (const s of desc.split(/(?<=[.!?\n•;])\s+/)) {
    if (/^\W*if\b|\bif (?:you|graduation|graduating)\b/i.test(s)) continue; // "If you graduate in Spring 2027, apply to ..."
    const preferred = /\b(prefer\w*|ideal\w*|desired|a plus|nice to have)\b/i.test(s);
    const cue = s.match(GRAD_CUE);
    let region = cue ? s.slice(cue.index, cue.index + 160).split(/\b(?:internship|program|programme|starts?|starting|begin\w*|available|runs?|running)\b|\n/i)[0] : '';
    // "You must not have graduated before September 2027": the words before the cue flip its meaning.
    const lead = cue ? s.slice(Math.max(0, cue.index - 30), cue.index) : '';
    let quoted = false;
    if (!/\b20\d{2}\b/.test(region)) {
      quoted = true;
      // "(December 2027 or May 2028 degree completion)", "will consider 2029 graduates"
      const m = s.match(new RegExp(String.raw`(?:(?:${MONTH_RE})(?:\s*\/\s*(?:${MONTH_RE}))*\s+)?20\d{2}(?:\s*(?:,|or|and|-|–|—|to|through)\s*(?:(?:${MONTH_RE})(?:\s*\/\s*(?:${MONTH_RE}))*\s+)?20\d{2})*\s+(?:graduates|grads|degree completion|graduation)\b`, 'i'));
      region = m ? m[0] : '';
    }
    if (region && !/\brecent(?:ly)?\s+graduat|(?<!not (?:have )?)\bgraduated\s+(?:in|after|since|within|between)\b/i.test(region)) {
      const pts = datePoints(region, now);
      if (pts.length) {
        let min = Math.min(...pts), max = Math.max(...pts);
        const later = /\bor\s+(?:any\s?time\s+)?(?:later|after|beyond)\b|\bon or after\b|\bno earlier than\b|\bnot\s+(?:have\s+|be\s+)?(?:scheduled\s+to\s+)?graduat\w*\s+(?:before|prior to)\b|\breturning to\b/i.test(lead + region);
        const by = !later && new RegExp(String.raw`\b(?:by|no later than|before|prior to)\s+(?:the end of\s+)?(?:(?:${MONTH_RE})\s+(?:of\s+)?)?20\d{2}`, 'i').test(region);
        if (later) max = Infinity;
        else if (by) { min = -Infinity; if (/\bor the following year\b/i.test(s)) max += 1; }
        // Quote the rule up to its last date: "graduation date between December 2027 and June 2028".
        const last = [...region.matchAll(/\b20\d{2}\b/g)].pop();
        const stop = last.index + 4 + (region.slice(last.index + 4).match(/^\s*(?:or (?:any\s?time )?(?:later|after|beyond)|or the following year)/i)?.[0].length || 0);
        const text = quoted ? region : `${lead.match(/not\s+(?:have\s+)?$/i)?.[0] || ''}${region.slice(0, stop)}`;
        wins.push({ min, max, preferred, text: text.replace(/\s+/g, ' ').trim() });
      }
    }
    // Rules about the internship's own dates rather than a calendar year.
    if (/reimburs|relocat/i.test(s)) continue;
    if (/\b(?:must|need|required|should|be)\b[^.]{0,40}\breturn(?:ing)? to (?:school|campus|university|college|(?:your |their )?(?:degree|studies|university|program|education))|\band returning to (?:school|your)(?!\/home)|\breturning to school (?:after|following|afterward|at the end)|\b(?:semesters?|quarters?|terms?)(?: or (?:semester|quarter|term))?\s+(?:of\s+(?:school\w*|study|coursework)\s+)?(?:remaining|left)\s+(?:after|following)|\bnot\s+(?:be\s+)?(?:scheduled\s+to\s+)?graduat\w*\s+(?:before|prior to)\s+(?:the\s+)?(?:end|conclusion|completion)|\bgraduate prior to the conclusion of the internship|\bmonths? until graduation after/i.test(s)) {
      musts.push({ min: end, max: Infinity, text: 'You must still be in school after the internship ends' });
    }
    const mo = s.match(new RegExp(String.raw`graduat\w* (?:before|prior to) (${MONTH_RE}) of the internship year`, 'i'));
    if (mo) musts.push({ min: Math.floor(termPoint(job)) + (monthOf(mo[1]) - 1) / 12, max: Infinity, text: `Can't graduate before ${mo[1]} of the internship year` });
    if (/\bgraduating within (?:one|1|a) year\b|\b(?:one|1) or (?:less|fewer) (?:academic )?years? remaining after\b/i.test(s)) musts.push({ min: -Infinity, max: end + 1, text: 'Wants students within a year of graduating' });
  }
  if (!wins.length && !musts.length) return null;
  const inside = w => g >= w.min - TOL && g <= w.max + TOL;
  const you = `you graduate ${edu.gradDate || edu.gradYear}`;
  const broken = musts.find(w => !inside(w));
  if (broken) return { ok: false, text: `${broken.text}; ${you}` };
  if (!wins.length) return { ok: true, text: `${musts[0].text}: ${you}, so you fit` };
  const hit = wins.find(inside);
  const quote = [...new Set(wins.map(w => `“${w.text}”`))].slice(0, 2).join(' or ');
  if (hit) return { ok: true, matched: true, text: `Graduation rule ${`“${hit.text}”`}: ${you}, so you fit` };
  return { ok: false, preferred: wins.every(w => w.preferred), text: `Wants ${quote}; ${you}` };
}

// Internships are scored on student fit (enrolled, graduation year, degree level) instead of years of experience.
export function scoreInternship(job, resume, prefs) {
  const text = `${job.title}\n${job.desc}`;
  const now = new Date().getFullYear();
  const edu = resume.education || {};
  const reasons = [];
  const flags = [];

  // Which of your target roles this is, and how closely; it is named so the reason is never a mystery.
  const m = internMatcher(prefs.roles)(job);
  const major = degreeFit(job, resume, { student: true });
  // Field = does it match what you want AND what you study.
  const roleFit = { exact: 1, field: 0.75, category: 0.6, any: 0.7 }[m?.kind] ?? 0.3;
  const title = Math.min(roleFit, major.fit);
  if (m?.kind === 'exact') reasons.push(`Matches your target role "${m.role}"`);
  else if (m?.kind === 'field') reasons.push(`Same field as your target role "${m.role}"`);
  else if (m?.kind === 'category') reasons.push(`Listed under the same category as your target role "${m.role}"`);
  else if (!m) flags.push(`Not one of your target roles (${prefs.roles.join(', ')})`);
  reasons.push(...major.reasons); flags.push(...major.flags);

  const { skills: keywordSkills, matched, missing, want } = skillFit(text, job, resume);
  if (want.length >= 3) reasons.push(`You have ${matched.length} of ${want.length} skills it asks for`);
  const req = reqCheck(job, resume, keywordSkills);
  const skills = req.skills;
  reasons.push(...req.reasons); flags.push(...req.flags);

  let student = 1;
  let cap = 5; // hard eligibility rules cap the score instead of just lowering it
  const grad = edu.gradYear;
  const rule = grad ? gradRule(job, edu) : null;
  if (grad && grad < now) { student = 0.35; cap = 2.5; flags.push(`Internships want current students; your resume shows you graduated in ${grad}`); }
  else if (rule && !rule.ok && rule.preferred) { student = Math.min(student, 0.6); flags.push(rule.text.replace(/^Wants/, 'Prefers')); }
  else if (rule && !rule.ok) { student = 0.3; cap = 2.9; flags.push(rule.text); }
  else if (rule) reasons.push(rule.text);
  else if (grad) reasons.push(`No graduation-date limit listed; you graduate ${edu.gradDate || grad}`);
  if (!edu.gradStudent && (/\b(ph\.?\s?d|doctoral|master'?s (student|candidate|program))\b/i.test(job.title) || /\b(MS|M\.S\.|PhD)\b/.test(job.title) || gradOnlyText(job.desc))) { student = Math.min(student, 0.25); cap = Math.min(cap, 2.5); flags.push('Meant for graduate students'); }
  const cls = classFit(job, edu, !!rule?.matched);
  if (cls?.ok) reasons.push(cls.text);
  else if (cls?.preferred) { student = Math.min(student, 0.6); flags.push(cls.text); }
  else if (cls) { student = Math.min(student, 0.3); cap = Math.min(cap, 2.5); flags.push(cls.text); }
  const gpaMin = +((job.desc || '').match(/(?:minimum|min\.?|at least)[^.\n]{0,20}?([23]\.\d)\s*(?:\/\s*4\.0\s*)?gpa|gpa[^.\n]{0,20}?(?:of|minimum)?\s*([23]\.\d)\s*(?:or (?:higher|above)|\+)/i) || []).slice(1).find(Boolean) || 0;
  if (gpaMin && edu.gpa && +edu.gpa < gpaMin) { student = Math.min(student, 0.4); cap = Math.min(cap, 2.9); flags.push(`Asks for a ${gpaMin}+ GPA; yours is ${edu.gpa}`); }
  else if (gpaMin && edu.gpa) reasons.push(`Your ${edu.gpa} GPA meets its ${gpaMin} minimum`);
  if (job.term) reasons.push(`${job.term} internship`);

  const ageDays = job.posted ? (Date.now() - job.posted) / 86400000 : 30;
  const fresh = ageDays < 7 ? 1 : ageDays < 21 ? 0.8 : ageDays < 45 ? 0.6 : 0.45;
  if (ageDays < 3) reasons.push('Just posted: internship spots fill on a rolling basis, so apply early');

  const exp = fieldExperience(job, resume, want, { student: true });
  reasons.push(...exp.reasons); flags.push(...exp.flags);
  const comp = competition(job, resume, { exp: exp.score, skills, gpa: +edu.gpa || 0 });
  reasons.push(...comp.reasons); flags.push(...comp.flags);

  // Not one of the roles you asked for: it can't be a strong fit for you, however the rest scores.
  let score = Math.min(cap, major.cap, m ? 5 : 2.8, req.cap, 1 + 4 * (0.2 * title + 0.25 * skills + 0.2 * exp.score + 0.25 * student + 0.05 + 0.05 * fresh) - comp.penalty);
  const notUs = prefs.needsSponsor || prefs.otherCountry;
  if (notUs && (/does not offer sponsorship|citizenship is required/i.test(job.sponsorship) || /(no|not|unable to|cannot|won't|will not)\s+(provide\s+|offer\s+)?(visa\s+)?sponsor|u\.s\. citizen(ship)? (is )?required/i.test(job.desc))) {
    score = Math.min(score, 1.8); flags.push(job.sponsorship ? `${job.sponsorship}` : 'Will not sponsor visas');
  } else if (/citizenship is required/i.test(job.sponsorship)) flags.push('U.S. citizens only');
  // Without the posting text we can't check skills or class year, so it can't earn a 4+ yet.
  if (!job.descLoaded) { score = Math.min(score, 3.9); flags.push(titleOnlyNote(job)); }

  score = Math.round(Math.min(5, Math.max(1, score)) * 10) / 10;
  return {
    score, matched, missing: missing.slice(0, 15),
    parts: { title, skills, experience: exp.score, seniority: student, odds: comp.odds, fresh },
    reasons, flags, student: true, tier: comp.tier, related: exp.related, reqs: req.summary,
    verdict: score >= 4.5 ? 'Apply now: great student fit' : score >= 4 ? 'Strong fit for you' : score >= 3 ? 'Possible stretch' : 'Skip this one',
    label: matched.slice(0, 5).map(pretty).join(', '),
  };
}

// ---------- field experience: have you actually done this kind of work? ----------
const ROLE_NOUNS = new Set(['engineer', 'engineering', 'developer', 'development', 'analyst', 'analytics', 'manager', 'management', 'specialist', 'associate', 'scientist', 'science', 'designer', 'design', 'coordinator', 'consultant', 'representative', 'assistant', 'architect', 'researcher', 'technician', 'administrator', 'accountant', 'writer']);
const NOISE = new Set(['senior', 'junior', 'staff', 'principal', 'lead', 'head', 'intern', 'internship', 'co', 'op', 'summer', 'fall', 'spring', 'winter', 'new', 'grad', 'graduate', 'early', 'career', 'entry', 'level', 'sr', 'jr', 'ii', 'iii', 'iv', 'remote', 'hybrid', 'and', 'of', 'the', 'for', 'to', 'in', 'with', 'at', 'team', 'undergrad', 'undergraduate', 'student', 'program', 'us', 'usa']);
const stem = w => w.slice(0, Math.min(6, Math.max(4, w.length - 1)));

function fieldOf(title) {
  const words = title.toLowerCase().replace(/\(.*?\)/g, ' ').split(/[^a-z+#]+/).filter(w => w.length > 1 && !NOISE.has(w));
  return { specific: words.filter(w => !ROLE_NOUNS.has(w)).map(stem), roles: words.filter(w => ROLE_NOUNS.has(w)).map(stem) };
}

// An entry counts when it is in the same field as the posting (title words) or uses 2+ of the skills it asks for.
// Student projects and activities count with a single shared skill: that is what student experience looks like.
function fieldExperience(job, resume, jdSkills, { student, needYears = 0 }) {
  const { specific, roles } = fieldOf(job.title);
  const want = new Set(jdSkills);
  const related = (resume.entries || []).filter(e => {
    const t = e.text.toLowerCase();
    const sameField = specific.length ? specific.some(s => t.includes(s)) : roles.some(s => t.includes(s));
    // For technical roles, a student's coding project counts even if it used different languages.
    const techProject = student && e.kind !== 'job' && TECH_TITLE.test(job.title) && e.skills.some(s => TECH_SKILLS.includes(s) || /react|node|django|flask|api|html|css/.test(s));
    return sameField || techProject || e.skills.filter(s => want.has(s)).length >= (student && e.kind !== 'job' ? 1 : 2);
  });
  // A club or activity entry with a real role ("Software Developer, HackOHI/O Tech Team") counts like a job.
  const roleLike = e => e.kind === 'activity' && /\b(developer|engineer|intern|analyst|manager|assistant|designer|researcher|consultant|director|coordinator|lead|chair|president|officer|tutor|instructor)\b/i.test(e.header);
  const jobs = related.filter(e => e.kind === 'job' || roleLike(e)), projects = related.filter(e => e.kind === 'project'), acts = related.filter(e => e.kind === 'activity' && !roleLike(e));
  const years = jobs.reduce((n, e) => n + e.years, 0);
  let score;
  if (student) score = Math.min(1, (jobs.length ? 0.5 : 0) + (jobs.length > 1 ? 0.15 : 0) + 0.2 * Math.min(projects.length, 2) + (acts.length ? 0.1 : 0)) || 0.15;
  else score = Math.min(1, (jobs.length ? 0.45 + 0.55 * Math.min(1, years / Math.max(1, needYears)) : 0) + 0.15 * Math.min(projects.length, 2)) || 0.1;

  const parts = [jobs.length && `${jobs.length} past ${student ? 'job/internship' : 'role'}${jobs.length > 1 ? 's' : ''}${!student && years ? ` (about ${years} yr${years > 1 ? 's' : ''})` : ''}`,
    projects.length && `${projects.length} project${projects.length > 1 ? 's' : ''}`, acts.length && `${acts.length} activit${acts.length > 1 ? 'ies' : 'y'}`].filter(Boolean);
  const reasons = parts.length ? [`Relevant experience: ${parts.join(' + ')} in this field`] : [];
  const flags = parts.length ? [] : [student ? 'No past jobs or projects in this field on your resume: add a class project or club work if you have one' : 'No past roles or projects in this field on your resume'];
  if (!student && jobs.length && needYears > years + 1) flags.push(`About ${years || '<1'} yr of related work; this level usually wants ${needYears}+`);
  return { score, reasons, flags, related: related.map(e => e.header.split(' · ')[0]).slice(0, 4) };
}

// ---------- competition: how hard this employer is to get into, relative to your profile ----------
const DIFFICULTY = { 1: 1, 2: 0.7, 3: 0.4, 4: 0.15 };
function competition(job, resume, { exp, skills, gpa = 0 }) {
  const tier = companyTier(job.company, job.boardSize);
  const best = (resume.brands || [])[0];
  const brand = best ? { 1: 1, 2: 0.75, 3: 0.4 }[best.tier] || 0 : 0;
  // Profile strength: related experience, skill match, brand-name employers, strong GPA (students).
  const strength = Math.min(1, 0.45 * exp + 0.35 * skills + 0.2 * brand + (gpa >= 3.7 ? 0.1 : 0));
  const gap = Math.max(0, 0.9 - strength);
  const penalty = DIFFICULTY[tier] * gap * 1.6;
  const reasons = [], flags = [];
  if (tier <= 2) (strength >= 0.75 ? reasons : flags).push(strength >= 0.75 ? `${TIER_LABEL[tier]} company, but your profile is strong enough to compete` : `${TIER_LABEL[tier]} company: very high applicant demand, so a profile like yours has lower odds here`);
  else if (tier === 4) reasons.push('Less crowded than big-name employers: better odds');
  if (best && best.tier <= 2) reasons.push(`${best.name} on your resume stands out to recruiters`);
  return { tier, penalty, odds: Math.max(0, 1 - penalty / 1.44), reasons, flags };
}

// ---------- degree fit: does what you study match what the job hires from? ----------
const FAMILIES = {
  cs: [/computer science|computer engineering|software engineering|informatics|computing|information (technology|systems|science)|data science|\bCSE?\b|\bEECS\b|\bECE\b/i, 'Computer Science'],
  eng: [/(electrical|mechanical|civil|chemical|aerospace|industrial|biomedical|materials|systems|manufacturing|nuclear) engineering|\bengineering\b/i, 'Engineering'],
  math: [/mathematic|statistic|actuarial|physics|quantitative|operations research/i, 'Math/Statistics'],
  business: [/business|marketing|management|finance|accounting|economics|supply chain|entrepreneurship|\bMBA\b|commerce|sales|hospitality|real estate/i, 'Business'],
  comm: [/communication|journalism|public relations|advertising|media studies|english|writing|rhetoric/i, 'Communications'],
  design: [/\bdesign\b|graphic|fine arts?\b|\bart\b|architecture|human.computer interaction|\bHCI\b|animation|film/i, 'Design/Arts'],
  science: [/biology|chemistry|neuroscience|biochem|health|nursing|pharmac|kinesiology|environmental|life sciences?|biomedical sciences?|public health/i, 'Science/Health'],
  social: [/psychology|sociology|political science|history|anthropology|international (relations|studies)|public policy|philosophy|criminal justice/i, 'Social Sciences'],
  edu: [/\beducation\b|teaching/i, 'Education'],
  law: [/\blaw\b|legal studies|pre-law/i, 'Law'],
};
const RELATED = { cs: ['math', 'eng'], eng: ['cs', 'math'], math: ['cs', 'eng', 'business'], business: ['comm', 'math'], comm: ['business', 'design'], design: ['comm', 'cs'], science: ['eng'], social: ['comm', 'edu', 'law'], edu: ['social'], law: ['social', 'business'] };
const familiesIn = text => Object.keys(FAMILIES).filter(f => FAMILIES[f][0].test(text || ''));
const famNames = fams => fams.map(f => FAMILIES[f][1]).join(' or ');
const TECH_TITLE = /software|developer|\bswe\b|machine learning|\bml\b|\bai\b engineer|data (scien|engineer)|firmware|embedded|hardware engineer|devops|site reliability|\bsre\b|security engineer|back.?end|front.?end|full.?stack|mobile engineer|\bios\b|android|computer vision|robotics engineer/i;
const TECH_SKILLS = ['python', 'java', 'javascript', 'typescript', 'c++', 'c#', 'go', 'rust', 'sql', 'react', 'node.js', 'git', 'aws', 'docker', 'kubernetes', 'machine learning', 'data structures', 'algorithms', 'swift', 'kotlin', 'matlab', 'r'];

// Majors the posting asks for, read from sentences about degrees ("pursuing a degree in Computer Science
// or a related field", "Finance or Economics majors"). "Any major" means no restriction.
function wantedMajors(desc = '') {
  if (/\b(any|all) (majors?|disciplines?|fields? of study)\b|regardless of (major|degree)|no specific major|open to all majors/i.test(desc)) return { fams: [], related: false };
  // Only the words right after "degree in / majoring in / pursuing ..." or right before "majors / students / degree".
  const stop = /\b(and|with|who|to|where|while|that)\s+(a |an )?(strong|passion|interest|experience|ability|knowledge|understanding|familiarity|proficien|excellent|demonstrated)|\b(experience|knowledge|skills?|understanding) (in|of|with)\b/i;
  // A window ends at a sentence end, but not at the dots inside "B.S." or "M.S.".
  const cut = s => s.split(/(?<![A-Z])\.(?:\s|$)/)[0].split(stop)[0];
  const windows = [
    ...[...desc.matchAll(/\b(?:degree|majoring|major|pursuing|studying|enrolled|discipline|field of study|bachelor['’]?s|B\.?S\.?|B\.?A\.?)\b([^;\n]{0,160})/gi)].map(m => cut(m[1])),
    ...[...desc.matchAll(/([A-Za-z ,&/-]{3,90}?)\s+(?:majors|students|degree|background)\b/g)].map(m => m[1].split(/[.;:]/).pop()),
  ];
  const fams = [...new Set(windows.flatMap(familiesIn))];
  return { fams, related: windows.some(w => /related (technical |quantitative )?(field|discipline|major|area)|similar field|equivalent/i.test(w)) || /related (technical )?field/i.test(desc) && fams.length > 0 };
}

function degreeFit(job, resume, { student }) {
  const edu = resume.education || {};
  const mine = familiesIn(edu.fieldText || `${edu.degree} ${edu.major}`);
  const myMajor = (edu.fieldText || edu.major || '').split(' · ').map(s => s.replace(/^(bachelor|master)[^,]*? (of|in) (science|arts)?( in)?\s*/i, '').replace(/^(specialization|major|minor|concentration):\s*/i, '')).filter(Boolean).slice(0, 2).join(', ') || famNames(mine);
  if (!mine.length) return { fit: 1, cap: 5, reasons: [], flags: [] };
  const { fams, related } = wantedMajors(job.desc);
  const ok = fams.filter(f => mine.includes(f));
  const near = fams.filter(f => mine.some(m => (RELATED[m] || []).includes(f)));
  if (fams.length && ok.length) return { fit: 1, cap: 5, reasons: [`Hires ${famNames(fams)} majors: that's your field`], flags: [] };
  if (fams.length && near.length && related) return { fit: 0.65, cap: 4.2, reasons: [], flags: [`Asks for ${famNames(fams)} or a related field; your ${myMajor} is related, not an exact match`] };
  if (fams.length) {
    return { fit: 0.1, cap: student ? 1.9 : 2.4, reasons: [], flags: [`Asks for ${student ? 'students pursuing ' : 'a degree in '}${famNames(fams)}${related ? ' (or related)' : ''}; you study ${myMajor}`] };
  }
  // No majors listed: technical roles still hire from CS/engineering/math unless the resume shows real coding skills.
  const techMajor = mine.some(f => ['cs', 'eng', 'math'].includes(f));
  if (TECH_TITLE.test(job.title) && !techMajor) {
    const coding = (resume.skills || []).filter(s => TECH_SKILLS.includes(s)).length;
    if (coding < 3) return { fit: 0.2, cap: student ? 2.2 : 2.6, reasons: [], flags: [`Technical role usually filled by Computer Science or engineering majors; you study ${myMajor} and your resume shows little coding`] };
    return { fit: 0.6, cap: 3.8, reasons: [], flags: [`Technical role; your ${myMajor} degree is outside the usual majors, but your coding skills help`] };
  }
  return { fit: 1, cap: 5, reasons: [], flags: [] };
}

// ---------- must-haves and nice-to-haves ----------
// Each requirement line is checked against the resume; missing must-haves pull the score down hard.
const shortReq = t => (t.length > 60 ? `${t.slice(0, 57).replace(/\s+\S*$/, '')}…` : t);
function reqCheck(job, resume, keywordSkills) {
  const r = job.descLoaded ? requirementFit(job.desc, resume) : null;
  const summary = r && { must: r.must.map(i => ({ t: i.text, s: i.status })), nice: r.nice.map(i => ({ t: i.text, s: i.status })) };
  if (!r || (!r.mustRate && !r.niceRate)) return { skills: keywordSkills, cap: 5, reasons: [], flags: [], summary };
  const reasons = [], flags = [];
  let cap = 5, skills;
  if (r.mustRate) {
    skills = 0.6 * r.mustRate.score + 0.2 * (r.niceRate?.score ?? r.mustRate.score) + 0.2 * keywordSkills;
    const missing = r.must.filter(i => i.status === 'missing').slice(0, 2).map(i => `"${shortReq(i.text)}"`).join(', ');
    const tally = `${r.mustRate.met} of ${r.mustRate.n} must-haves${r.mustRate.partial ? ` (${r.mustRate.partial} partly)` : ''}`;
    if (r.mustRate.n >= 2 && r.mustRate.score < 0.3) { cap = 2.5; flags.push(`Meets only ${tally}; missing ${missing}`); }
    else if (r.mustRate.n >= 2 && r.mustRate.score < 0.55) { cap = 3.4; flags.push(`Meets ${tally}; missing ${missing}`); }
    else reasons.push(`Meets ${tally}${r.niceRate ? ` and ${r.niceRate.met} of ${r.niceRate.n} nice-to-haves` : ''}`);
  } else {
    skills = 0.75 * keywordSkills + 0.25 * r.niceRate.score;
    reasons.push(`Meets ${r.niceRate.met} of ${r.niceRate.n} nice-to-haves`);
  }
  return { skills, cap, reasons, flags, summary };
}

export const scoreClass = s => `s${Math.max(1, Math.min(5, Math.floor(s)))}`;

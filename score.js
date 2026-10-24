// Rates a job 1.0–5.0 for one candidate, with the reasons behind the number.
import { skillWeights, pretty } from './skills.js';
import { titleMatcher } from './search.js';

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

  const roleHit = prefs.roles.length ? titleMatcher(prefs.roles)(job.title) : true;
  const title = roleHit ? 1 : 0.45;
  if (roleHit && prefs.roles.length) reasons.push('Title matches what you want');

  const weights = skillWeights(text);
  const want = Object.keys(weights);
  const have = new Set(resume.skills);
  const matched = want.filter(s => have.has(s));
  const missing = want.filter(s => !have.has(s)).sort((a, b) => weights[b] - weights[a]);
  const totalW = want.reduce((a, s) => a + weights[s], 0);
  const gotW = matched.reduce((a, s) => a + weights[s], 0);
  let skills = want.length >= 3 ? Math.min(1, Math.pow(gotW / totalW, 0.75) * 1.08) : 0.65;
  if (!job.descLoaded) skills = 0.6;
  if (want.length >= 3) reasons.push(`You have ${matched.length} of ${want.length} skills it asks for`);

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

  let raw = 0.25 * title + 0.45 * skills + 0.2 * seniority + 0.05 + 0.05 * fresh;
  let score = 1 + 4 * raw;

  if (prefs.needsSponsor && /(no|not|unable to|cannot|won't|will not)\s+(provide\s+|offer\s+)?(visa\s+)?sponsor/i.test(job.desc)) { score = Math.min(score, 1.8); flags.push('Says it will not sponsor visas'); }
  if (/(security|secret|ts\/sci) clearance (is )?required|active (secret|ts\/sci|top secret)/i.test(job.desc) && !/clearance/i.test(resume.text)) { score = Math.min(score, 2.4); flags.push('Requires a security clearance'); }
  if (!job.descLoaded) flags.push('Score based on title only; open it for the full read');

  score = Math.round(Math.min(5, Math.max(1, score)) * 10) / 10;
  return {
    score, matched, missing: missing.slice(0, 15),
    parts: { title, skills, seniority, fresh },
    reasons, flags,
    verdict: score >= 4.5 ? 'Apply now' : score >= 4 ? 'Strong fit, apply' : score >= 3 ? 'Possible, only with a reason' : 'Skip',
    label: matched.slice(0, 5).map(pretty).join(', '),
  };
}

export const scoreClass = s => `s${Math.max(1, Math.min(5, Math.floor(s)))}`;

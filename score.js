// Rates a job 1.0–5.0 for one candidate, with the reasons behind the number.
import { skillWeights, pretty } from './skills.js';
import { titleMatcher, internMatcher } from './search.js';

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

  const { skills, matched, missing, want } = skillFit(text, job, resume);
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

const CLASS_WORDS = { freshman: 'freshmen', sophomore: 'sophomores', 'rising junior': 'rising juniors', junior: 'juniors', 'rising senior': 'rising seniors', senior: 'seniors' };

// Internships are scored on student fit (enrolled, graduation year, degree level) instead of years of experience.
export function scoreInternship(job, resume, prefs) {
  const text = `${job.title}\n${job.desc}`;
  const now = new Date().getFullYear();
  const edu = resume.education || {};
  const reasons = [];
  const flags = [];

  const field = internMatcher(prefs.roles)(job);
  // Exact role match ("software engineer" -> "Software Engineering Intern") beats a same-field match ("Data Intern").
  const exact = titleMatcher(prefs.roles.map(r => r.replace(/\b(intern(ship)?|co-?op)\b/gi, '').trim()).filter(Boolean))(job.title);
  const title = exact ? 1 : field ? 0.7 : 0.4;
  if (field && prefs.roles.length) reasons.push('Same field as what you want');

  const { skills, matched, missing, want } = skillFit(text, job, resume);
  if (want.length >= 3) reasons.push(`You have ${matched.length} of ${want.length} skills it asks for`);

  let student = 1;
  let cap = 5; // hard eligibility rules cap the score instead of just lowering it
  const grad = edu.gradYear;
  const wantYears = [...new Set([...`${job.title}\n${job.desc || ''}`.matchAll(/(?:graduat\w*|grad year|class of|expected|degree)[^.\n]{0,60}?\b(20\d{2})\b/gi)].map(m => +m[1]).filter(y => y >= now - 1 && y <= now + 6))];
  if (grad && grad < now) { student = 0.35; cap = 2.5; flags.push(`Internships want current students; your resume shows you graduated in ${grad}`); }
  else if (grad && wantYears.length && !wantYears.includes(grad)) { student = 0.3; cap = 2.9; flags.push(`Wants students graduating ${wantYears.join(' or ')}; you graduate ${grad}`); }
  else if (grad && wantYears.includes(grad)) reasons.push(`Looking for the class of ${grad}: that's you`);
  else if (grad) reasons.push(`Open to students; you graduate ${grad}`);
  if (!edu.gradStudent && (/\b(ph\.?\s?d|doctoral|master'?s (student|candidate|program))\b/i.test(job.title) || /\b(MS|M\.S\.|PhD)\b/.test(job.title) || /currently (enrolled|pursuing) (in )?a (ph\.?d|master)/i.test(job.desc))) { student = Math.min(student, 0.25); cap = Math.min(cap, 2.5); flags.push('Meant for graduate students'); }
  const cls = Object.keys(CLASS_WORDS).find(c => new RegExp(`\\b${c}s?\\b`, 'i').test(job.desc || ''));
  if (cls) reasons.push(`Open to ${CLASS_WORDS[cls]}`);
  const gpaMin = +((job.desc || '').match(/(?:minimum|min\.?|at least)[^.\n]{0,20}?([23]\.\d)\s*(?:\/\s*4\.0\s*)?gpa|gpa[^.\n]{0,20}?(?:of|minimum)?\s*([23]\.\d)\s*(?:or (?:higher|above)|\+)/i) || []).slice(1).find(Boolean) || 0;
  if (gpaMin && edu.gpa && +edu.gpa < gpaMin) { student = Math.min(student, 0.4); cap = Math.min(cap, 2.9); flags.push(`Asks for a ${gpaMin}+ GPA; yours is ${edu.gpa}`); }
  else if (gpaMin && edu.gpa) reasons.push(`Your ${edu.gpa} GPA meets its ${gpaMin} minimum`);
  if (job.term) reasons.push(`${job.term} internship`);

  const ageDays = job.posted ? (Date.now() - job.posted) / 86400000 : 30;
  const fresh = ageDays < 7 ? 1 : ageDays < 21 ? 0.8 : ageDays < 45 ? 0.6 : 0.45;
  if (ageDays < 3) reasons.push('Just posted: internship spots fill on a rolling basis, so apply early');

  let score = Math.min(cap, 1 + 4 * (0.25 * title + 0.4 * skills + 0.25 * student + 0.05 + 0.05 * fresh));
  const notUs = prefs.needsSponsor || prefs.otherCountry;
  if (notUs && (/does not offer sponsorship|citizenship is required/i.test(job.sponsorship) || /(no|not|unable to|cannot|won't|will not)\s+(provide\s+|offer\s+)?(visa\s+)?sponsor|u\.s\. citizen(ship)? (is )?required/i.test(job.desc))) {
    score = Math.min(score, 1.8); flags.push(job.sponsorship ? `${job.sponsorship}` : 'Will not sponsor visas');
  } else if (/citizenship is required/i.test(job.sponsorship)) flags.push('U.S. citizens only');
  // Without the posting text we can't check skills or class year, so it can't earn a 4+ yet.
  if (!job.descLoaded) { score = Math.min(score, 3.9); flags.push('Scored on title only: open it to read the posting and get the full score'); }

  score = Math.round(Math.min(5, Math.max(1, score)) * 10) / 10;
  return {
    score, matched, missing: missing.slice(0, 15),
    parts: { title, skills, seniority: student, fresh },
    reasons, flags, student: true,
    verdict: score >= 4.5 ? 'Apply now: great student fit' : score >= 4 ? 'Strong fit for you' : score >= 3 ? 'Possible stretch' : 'Skip this one',
    label: matched.slice(0, 5).map(pretty).join(', '),
  };
}

export const scoreClass = s => `s${Math.max(1, Math.min(5, Math.floor(s)))}`;

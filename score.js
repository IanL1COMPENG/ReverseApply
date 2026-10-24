// Rates a job 1.0–5.0 for one candidate, with the reasons behind the number.
import { skillWeights, pretty } from './skills.js';
import { titleMatcher, internMatcher } from './search.js';
import { companyTier, TIER_LABEL } from './companies-tiers.js';

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

  const exp = fieldExperience(job, resume, want, { student: false, needYears: yrs ?? [0, 0, 2, 5, 7, 10][Math.round(jl)] });
  reasons.push(...exp.reasons); flags.push(...exp.flags);
  const comp = competition(job, resume, { exp: exp.score, skills });
  reasons.push(...comp.reasons); flags.push(...comp.flags);

  const raw = 0.2 * title + 0.3 * skills + 0.25 * exp.score + 0.15 * seniority + 0.05 + 0.05 * fresh;
  let score = 1 + 4 * raw - comp.penalty;

  if (prefs.needsSponsor && /(no|not|unable to|cannot|won't|will not)\s+(provide\s+|offer\s+)?(visa\s+)?sponsor/i.test(job.desc)) { score = Math.min(score, 1.8); flags.push('Says it will not sponsor visas'); }
  if (/(security|secret|ts\/sci) clearance (is )?required|active (secret|ts\/sci|top secret)/i.test(job.desc) && !/clearance/i.test(resume.text)) { score = Math.min(score, 2.4); flags.push('Requires a security clearance'); }
  if (!job.descLoaded) flags.push('Score based on title only; open it for the full read');

  score = Math.round(Math.min(5, Math.max(1, score)) * 10) / 10;
  return {
    score, matched, missing: missing.slice(0, 15),
    parts: { title, skills, experience: exp.score, seniority, odds: comp.odds, fresh },
    reasons, flags, tier: comp.tier, related: exp.related,
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

  const exp = fieldExperience(job, resume, want, { student: true });
  reasons.push(...exp.reasons); flags.push(...exp.flags);
  const comp = competition(job, resume, { exp: exp.score, skills, gpa: +edu.gpa || 0 });
  reasons.push(...comp.reasons); flags.push(...comp.flags);

  let score = Math.min(cap, 1 + 4 * (0.2 * title + 0.25 * skills + 0.2 * exp.score + 0.25 * student + 0.05 + 0.05 * fresh) - comp.penalty);
  const notUs = prefs.needsSponsor || prefs.otherCountry;
  if (notUs && (/does not offer sponsorship|citizenship is required/i.test(job.sponsorship) || /(no|not|unable to|cannot|won't|will not)\s+(provide\s+|offer\s+)?(visa\s+)?sponsor|u\.s\. citizen(ship)? (is )?required/i.test(job.desc))) {
    score = Math.min(score, 1.8); flags.push(job.sponsorship ? `${job.sponsorship}` : 'Will not sponsor visas');
  } else if (/citizenship is required/i.test(job.sponsorship)) flags.push('U.S. citizens only');
  // Without the posting text we can't check skills or class year, so it can't earn a 4+ yet.
  if (!job.descLoaded) { score = Math.min(score, 3.9); flags.push('Scored on title only: open it to read the posting and get the full score'); }

  score = Math.round(Math.min(5, Math.max(1, score)) * 10) / 10;
  return {
    score, matched, missing: missing.slice(0, 15),
    parts: { title, skills, experience: exp.score, seniority: student, odds: comp.odds, fresh },
    reasons, flags, student: true, tier: comp.tier, related: exp.related,
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
    return sameField || e.skills.filter(s => want.has(s)).length >= (student && e.kind !== 'job' ? 1 : 2);
  });
  const jobs = related.filter(e => e.kind === 'job'), projects = related.filter(e => e.kind === 'project'), acts = related.filter(e => e.kind === 'activity');
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

export const scoreClass = s => `s${Math.max(1, Math.min(5, Math.floor(s)))}`;

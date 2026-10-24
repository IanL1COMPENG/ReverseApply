// Reads a resume file in the browser and pulls out profile fields and sections.
import { extractSkills } from './skills.js';
import { brandEmployers } from './companies-tiers.js';

export async function readResumeFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return readPdf(file);
  if (name.endsWith('.docx')) {
    const { value } = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return tidy(value);
  }
  return tidy(await file.text());
}

async function readPdf(file) {
  const pdfjs = window.pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(pdfLines(content.items).join('\n'));
  }
  return tidy(pages.join('\n'));
}

// Rebuilds lines from where text sits on the page, not the order the PDF stores it. Resumes often keep
// right-aligned columns (dates, locations) in a separate run, so stream order would detach
// "December 2028" from its degree line. Items sharing a baseline become one line, left to right;
// a wide gap (a right-aligned column) becomes " | " so fields stay separate.
export function pdfLines(items) {
  const runs = items.filter(it => it.str && it.str.trim()).map(it => ({
    str: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0, h: Math.abs(it.transform[3]) || it.height || 10,
  }));
  runs.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  for (const r of runs) {
    const row = rows.find(row => Math.abs(row.y - r.y) <= Math.max(2, 0.4 * Math.min(row.h, r.h)));
    if (row) row.items.push(r); else rows.push({ y: r.y, h: r.h, items: [r] });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map(row => {
    const its = row.items.sort((a, b) => a.x - b.x);
    let line = '', end = null;
    for (const it of its) {
      const gap = end === null ? 0 : it.x - end;
      if (end !== null) line += gap > 4 * it.h ? ' | ' : gap > 0.2 * it.h && !line.endsWith(' ') && !it.str.startsWith(' ') ? ' ' : '';
      line += it.str;
      end = it.x + it.w;
    }
    return line;
  });
}

// Tabs separate columns in Word documents too ("Bachelor of Science<TAB>December 2028").
const tidy = t => t.replace(/\r/g, '').replace(/[ ]*\t+[ \t]*/g, ' | ').replace(/[ ]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').split('\n').map(l => l.trim()).join('\n').trim();

const HEADINGS = {
  summary: /^(professional |career )?(summary|profile|objective|about( me)?)$/i,
  experience: /^((work|professional|relevant|additional|research|technical|industry|internship|other|related|engineering|teaching|clinical) )?(experiences?|employment( history)?|work history|internships?)$/i,
  projects: /^((personal|selected|academic|engineering|technical|software|research|relevant|class|course|key|independent|side|design|coding) )?projects?( (&|and) [a-z ]{3,30})?$/i,
  education: /^(education|academics?|academic background|education (&|and) [a-z ]{3,30})$/i,
  skills: /^((technical|core|key|relevant|additional|computer|professional) )?(skills|competencies|technologies|tools)( (&|and) [a-z ]{3,30})?$|^languages( (&|and) [a-z ]{3,20})?$/i,
  certifications: /^(certifications?|licenses|certificates)( (&|and) [a-z ]{3,30})?$/i,
  leadership: /^(leadership( (&|and) [a-z ]{3,30}| experience)?|activities( (&|and) [a-z ]{3,30})?|campus involvement|involvements?|extracurriculars?( activities)?|clubs( (&|and) organizations)?|organizations|volunteer(ing)?( experience| work)?|community (service|involvement)|service)$/i,
  awards: /^(awards|honors|achievements)( (&|and) [a-z ]{3,30})?$/i,
};

// Text copied out of a PDF viewer often drops the right-hand column (locations, dates) as a block further
// down, e.g. "Columbus, OH / December 2028 / Brookville, OH / January 2026-Present" inside Work Experience.
// Put the education entry's location and date back on its school line so the graduation date is read
// from where it belongs; the other column lines stay where they are.
const LOC_LINE = /^(?:[A-Z][A-Za-z .'-]+,\s?(?:[A-Z]{2}|[A-Z][a-z]+)|Remote|Hybrid)$/;
const DATE_LINE = new RegExp(`^(?:expected:?\\s*)?${'(?:(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?|Spring|Summer|Fall|Autumn|Winter)\\s+)?(?:19|20)\\d{2}'}(?:\\s*(?:-|–|—|to)\\s*(?:(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?|Spring|Summer|Fall|Autumn|Winter)\\s+)?(?:(?:19|20)\\d{2}|present|current|now))?$`, 'i');
export function reattachColumnDates(lines) {
  lines = lines.filter(l => !/^\s*[•▪◦●■►‣]\s*$/.test(l)); // lone bullet glyphs left behind by copy-paste
  const isHeading = (l, re) => re.test(l.replace(/[:|]+$/, '').trim());
  const sectionAt = lines.map(l => Object.keys(HEADINGS).find(k => l.trim().length < 40 && isHeading(l, HEADINGS[k])));
  const eduHead = sectionAt.indexOf('education');
  const school = lines.findIndex((l, i) => i > eduHead && SCHOOL_RE.test(l));
  if (school < 0) return lines;
  // Already has a date on the school line or the two lines under it: nothing to fix.
  const own = [school, school + 1, school + 2].filter(i => i < lines.length && !sectionAt[i] && !NOT_GRAD.test(lines[i])).map(i => lines[i]).join(' ');
  if (/(?:19|20)\d{2}/.test(own)) return lines;
  // Find the first run of 2+ consecutive location/date-only lines (with at least one date) after the school line.
  const isCol = i => LOC_LINE.test(lines[i].trim()) || DATE_LINE.test(lines[i].trim());
  let start = -1, end = -1;
  for (let i = school + 1; i < lines.length && end < 0; i++) {
    if (!isCol(i)) continue;
    let j = i;
    while (j + 1 < lines.length && isCol(j + 1)) j++;
    if (j > i && lines.slice(i, j + 1).some(l => DATE_LINE.test(l.trim()))) { start = i; end = j; }
    i = j;
  }
  if (start < 0) return lines;
  // Split the run into records: [location?, date].
  const records = [];
  let rec = null;
  for (let i = start; i <= end; i++) {
    const t = lines[i].trim();
    if (LOC_LINE.test(t)) { rec = { idx: [i], loc: t }; records.push(rec); }
    else { if (!rec || rec.date) { rec = { idx: [], loc: '' }; records.push(rec); } rec.idx.push(i); rec.date = t; }
  }
  // Column values come in document order: if Education is the first data section, its record is first;
  // otherwise use the first single date (a graduation date, not a job's "2025 - Present" range).
  const sections = sectionAt.filter(k => ['education', 'experience', 'projects', 'leadership'].includes(k));
  const pick = sections[0] === 'education' ? records.find(r => r.date) : records.find(r => r.date && !/(?:-|–|—|to)/.test(r.date));
  if (!pick) return lines;
  const out = lines.slice();
  out[school] = `${lines[school]}${pick.loc ? ` | ${pick.loc}` : ''} | ${pick.date}`;
  return out.filter((_, i) => !pick.idx.includes(i));
}

export function parseResume(text) {
  const lines = reattachColumnDates(text.split('\n'));
  const profile = {
    name: guessName(lines),
    email: (text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [''])[0],
    phone: (text.match(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/) || [''])[0],
    linkedin: (text.match(/(https?:\/\/)?(www\.)?linkedin\.com\/in\/[\w-]+/i) || [''])[0],
    site: (text.match(/(https?:\/\/)?(www\.)?github\.com\/[\w-]+/i) || [''])[0],
    location: lines.slice(0, 6).map(guessLocation).find(Boolean) || '',
  };
  const sections = [];
  let cur = { key: 'header', title: '', lines: [] };
  for (const raw of lines) {
    const l = raw.replace(/[:|]+$/, '').trim();
    const key = l.length < 40 && Object.keys(HEADINGS).find(k => HEADINGS[k].test(l));
    if (key) { sections.push(cur); cur = { key, title: l, lines: [] }; }
    else if (raw) cur.lines.push(raw);
  }
  sections.push(cur);
  // A paste that starts with a heading above the name ("EDUCATION / Kara R. Thomas / email | phone") would put
  // the name and contact line inside that section; move them back to the header.
  const header = sections.find(s => s.key === 'header');
  for (const s of sections.filter(s => s.key !== 'header').slice(0, 1)) {
    const isContact = l => /@|\(\d{3}\)|\d{3}[-.\s]\d{3}[-.\s]\d{4}|linkedin\.com|github\.com/i.test(l) || (profile.name && l.trim().toLowerCase().startsWith(profile.name.toLowerCase().split(' ')[0]) && l.trim().split(/\s+/).length <= 4 && !SCHOOL_RE.test(l));
    while (s.lines.length && !SCHOOL_RE.test(s.lines[0]) && !DEGREE_RE.test(s.lines[0]) && isContact(s.lines[0])) header.lines.push(s.lines.shift());
  }
  const kept = sections.filter(s => s.lines.length || s.key !== 'header');
  // Without an Education heading, only school/degree lines (and the line under each) count; never job or award dates.
  const eduText = kept.filter(s => s.key === 'education').flatMap(s => s.lines).join('\n')
    || lines.flatMap((l, i) => (SCHOOL_RE.test(l) || DEGREE_RE.test(l) ? [l, lines[i + 1] || ''] : [])).join('\n');
  const entries = parseEntries(kept);
  return {
    profile, sections: kept, skills: extractSkills(text), years: yearsOfExperience(text), education: parseEducation(eduText), entries,
    brands: brandEmployers(entries.filter(e => e.kind !== 'project').map(e => e.header)),
  };
}

// Each past job, project or activity as its own entry: header lines, bullets, years and skills.
const ENTRY_KIND = { experience: 'job', projects: 'project', leadership: 'activity' };
export function parseEntries(sections) {
  const entries = [];
  for (const s of sections) {
    const kind = ENTRY_KIND[s.key];
    if (!kind) continue;
    let cur = null;
    for (const line of s.lines) {
      const bullet = /^[•\-*▪◦●■►‣–]/.test(line);
      if (!bullet && (!cur || cur.bullets.length)) { cur = { kind, header: [line], bullets: [] }; entries.push(cur); }
      else if (!bullet) cur.header.push(line);
      else if (cur) cur.bullets.push(line);
    }
  }
  return entries.map(e => {
    const text = [...e.header, ...e.bullets].join('\n');
    return { kind: e.kind, header: e.header.join(' · '), text, years: yearsOfExperience(e.header.join(' ')), skills: extractSkills(text) };
  });
}

const SCHOOL_RE = /universit|college|institute|school of|polytechnic/i;
const DEGREE_RE = /\b(B\.?S\.?|B\.?A\.?|B\.?Eng|BBA|Bachelor|M\.?S\.?|M\.?A\.?|MBA|Master|Ph\.?D|Associate)\b/;
const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?';
const DATE = `(?:(?:${MONTH}|Spring|Summer|Fall|Autumn|Winter)\\s+)?(?:19|20)\\d{2}`;
const BULLET_LINE = /^\s*[•\-*▪◦●■►‣–]/;
// Lines that carry dates which are never the graduation date.
const NOT_GRAD = /dean'?s list|scholar|award|honou?r|recipient|president'?s list|semester|coursework|study abroad|exchange|club|society|hackathon|competition|certificat/i;

// The graduation date exactly as the resume writes it ("Expected May 2028", "December 2028", "2029"),
// taken only from the current (first) degree: the school line and the next two non-bullet lines.
// Bullets and honors lines ("Dean's List Autumn 2025 & Spring 2026") are never used.
export function gradDateOf(edu) {
  const lines = edu.split('\n');
  const start = Math.max(0, lines.findIndex(l => SCHOOL_RE.test(l) || DEGREE_RE.test(l)));
  const entry = [];
  for (let i = start; i < lines.length && entry.length < 3; i++) {
    const l = lines[i];
    if (BULLET_LINE.test(l)) continue;
    // A second school line starts an older degree: stop there.
    if (entry.length && SCHOOL_RE.test(l) && entry.some(e => SCHOOL_RE.test(e))) break;
    if (!NOT_GRAD.test(l)) entry.push(l);
  }
  const block = entry.join('  |  ');
  const m = block.match(new RegExp(`(?:expected|anticipated|graduat\\w*|grad\\.?|class of)[:\\s]*(${DATE})`, 'i'))
    || block.match(new RegExp(`${DATE}\\s*(?:-|–|—|to)\\s*(${DATE})`, 'i'))
    || [...block.replace(new RegExp(`${DATE}\\s*(?:-|–|—|to)\\s*(?:present|current|now)`, 'gi'), '').matchAll(new RegExp(`(${DATE})`, 'gi'))].pop();
  return m ? dateParts(m[1]) : { gradDate: '', gradYear: null };
}
export const dateParts = s => {
  const y = (s || '').match(/(?:19|20)\d{2}/);
  return y ? { gradDate: s.trim(), gradYear: +y[0] } : { gradDate: '', gradYear: null };
};

// School, degree, major, graduation date and GPA, for internship matching and student resumes.
export function parseEducation(edu) {
  const school = (edu.split('\n').find(l => SCHOOL_RE.test(l)) || '').split(/\s[—–|-]\s|,\s(?=[A-Z]{2}\b)/)[0].trim();
  const degreeM = edu.match(/\b(B\.?S\.?|B\.?A\.?|B\.?Eng|BBA|Bachelor(?:'s)?(?: of [A-Z][a-z]+)?|M\.?S\.?|M\.?A\.?|MBA|Master(?:'s)?(?: of [A-Z][a-z]+)?|Ph\.?D\.?|Associate(?:'s)?)\b/);
  const majorM = edu.match(/\b(?:B\.?S\.?|B\.?A\.?|Bachelor(?:'s)?(?: of [A-Za-z]+)?|M\.?S\.?|Master(?:'s)?(?: of [A-Za-z]+)?|Major)\s*(?:in|of|:|,)?\s*([A-Z][A-Za-z&]+(?: [A-Z&][A-Za-z&]+){0,3})/);
  const gpa = (edu.match(/GPA[:\s]*([0-4]\.\d{1,2})/i) || [])[1] || '';
  return {
    school, gpa,
    degree: degreeM ? degreeM[1] : '',
    major: majorM ? majorM[1].replace(/\s+(GPA|Expected|Class).*$/, '') : '',
    ...gradDateOf(edu),
    // The first degree listed is the current one on a student resume.
    gradStudent: !!degreeM && /^(M|Ph)/.test(degreeM[1]),
    fieldText: fieldOfStudy(edu),
  };
}

// What the person studies: the current degree's lines plus any Major / Minor / Specialization lines.
function fieldOfStudy(edu) {
  const lines = edu.split('\n');
  const start = Math.max(0, lines.findIndex(l => SCHOOL_RE.test(l) || DEGREE_RE.test(l)));
  const degree = lines.slice(start, start + 3).filter(l => DEGREE_RE.test(l) || /\b(major|minor|speciali[sz]|concentrat)/i.test(l));
  const extra = lines.filter(l => /\b(major|minor|speciali[sz]ation|concentration|track)\b/i.test(l));
  return [...new Set([...degree, ...extra])].filter(l => !NOT_GRAD.test(l)).join(' · ').replace(/\s*\|\s*[^|]*?(?:19|20)\d{2}.*$/gm, '');
}

function guessName(lines) {
  for (const l of lines.slice(0, 5)) {
    const c = l.replace(/[|•·].*$/, '').trim();
    if (/^[A-Za-z][A-Za-z'.-]+( [A-Za-z][A-Za-z'.-]+){1,3}$/.test(c) && !/resume|curriculum/i.test(c)) return c.replace(/\b([A-Z])([A-Z]+)\b/g, (m, a, b) => a + b.toLowerCase());
  }
  return '';
}

function guessLocation(line) {
  const m = line.split(/[|•·]/).map(s => s.trim()).map(s => s.match(/^([A-Z][a-zA-Z .]+),\s?([A-Z]{2})$/)).find(Boolean);
  return m ? `${m[1].trim()}, ${m[2]}` : '';
}

// Rough years of full-time experience from date ranges in the Experience section.
export function yearsOfExperience(text) {
  const now = new Date().getFullYear();
  const ranges = [...text.matchAll(/((?:19|20)\d{2})\s*(?:-|–|—|to)\s*((?:19|20)\d{2}|present|current|now)/gi)];
  let total = 0;
  for (const [, a, b] of ranges) {
    const end = /\d/.test(b) ? +b : now;
    if (end >= +a && end - a < 40) total += end - +a;
  }
  return Math.min(total, 40);
}

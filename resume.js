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
    // Rebuild lines from text positions so bullets and headings survive.
    const lines = [];
    let lastY = null, line = '';
    for (const it of content.items) {
      const y = Math.round(it.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 2) { lines.push(line); line = ''; }
      line += (line && !line.endsWith(' ') && !it.str.startsWith(' ') ? ' ' : '') + it.str;
      lastY = y;
    }
    lines.push(line);
    pages.push(lines.join('\n'));
  }
  return tidy(pages.join('\n'));
}

const tidy = t => t.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').split('\n').map(l => l.trim()).join('\n').trim();

const HEADINGS = {
  summary: /^(professional )?(summary|profile|objective|about( me)?)$/i,
  experience: /^(work |professional |relevant )?(experience|employment( history)?|work history)$/i,
  projects: /^(projects?|personal projects|selected projects|academic projects)$/i,
  education: /^(education|academics?|academic background|education (&|and) [a-z ]{3,30})$/i,
  skills: /^(technical |core )?(skills|competencies|technologies|skills & interests|tools)$/i,
  certifications: /^(certifications?|licenses|certificates)$/i,
  leadership: /^(leadership|activities|leadership & activities|involvement|volunteer(ing)?( experience)?)$/i,
  awards: /^(awards|honors|achievements|honors & awards)$/i,
};

export function parseResume(text) {
  const lines = text.split('\n');
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

// The graduation date exactly as the resume writes it, taken only from the first (current) degree:
// its own line and the line right under it. "Expected May 2028", "Aug 2025 – May 2029", "2029".
export function gradDateOf(edu) {
  const lines = edu.split('\n');
  const i = lines.findIndex(l => SCHOOL_RE.test(l) || DEGREE_RE.test(l));
  const block = (i >= 0 ? lines.slice(i, i + 2) : lines.slice(0, 2)).join('  ');
  const date = `(?:${MONTH}\\s+)?(?:19|20)\\d{2}`;
  const m = block.match(new RegExp(`(?:expected|anticipated|graduat\\w*|grad\\.?|class of)[:\\s]*(${date})`, 'i'))
    || block.match(new RegExp(`${date}\\s*(?:-|–|—|to)\\s*(${date})`, 'i'))
    || [...block.matchAll(new RegExp(`(${date})`, 'gi'))].pop();
  if (!m) return { gradDate: '', gradYear: null };
  const gradDate = m[1].trim();
  return { gradDate, gradYear: +gradDate.match(/(?:19|20)\d{2}/)[0] };
}

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
  };
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

// Reads a resume file in the browser and pulls out profile fields and sections.
import { extractSkills } from './skills.js';

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
  education: /^(education|academics?|education & certifications)$/i,
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
  return { profile, sections: sections.filter(s => s.lines.length || s.key !== 'header'), skills: extractSkills(text), years: yearsOfExperience(text) };
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

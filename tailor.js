// Tailors a parsed resume to one job and renders it as an ATS-friendly PDF.
// Rule from career-ops: keywords get reordered and emphasised, never invented.
import { pretty, skillWeights } from './skills.js';

const BULLET = /^[•\-*▪◦●■►‣–]\s*/;
const ORDER = ['summary', 'skills', 'experience', 'projects', 'leadership', 'education', 'certifications', 'awards'];

export function tailorResume(parsed, profile, job, fit, extraSkills = []) {
  const weights = skillWeights(`${job.title}\n${job.desc}`);
  const hits = line => Object.keys(weights).reduce((n, s) => n + (new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(line) ? weights[s] : 0), 0);
  const lead = [...fit.matched].sort((a, b) => weights[b] - weights[a]);

  const sections = [];
  const bySection = key => parsed.sections.filter(s => s.key === key);

  const summary = bySection('summary').flatMap(s => s.lines);
  const focus = [...lead, ...extraSkills].slice(0, 6).map(pretty);
  const edu = parsed.education || {};
  // Students lead with who they are (school, major, class year) and put Education right under it.
  const studentLead = () => {
    const who = `${edu.major ? `${edu.major} student` : 'Student'}${edu.school ? ` at ${edu.school}` : ''}${edu.gradYear ? ` (graduating ${edu.gradYear})` : ''}`;
    return `${who}${focus.length ? ` with hands-on experience in ${listJoin(focus)}` : ''}, seeking a ${job.term ? `${job.term.split(',')[0]} ` : ''}${roleNoun(job.title).replace(/\s*\b(intern(ship)?|co-?op)\b\s*/gi, ' ').trim() || 'internship'} internship.`.replace(/ internship internship/, ' internship');
  };
  sections.push({ title: 'Summary', lines: [
    fit.student ? studentLead()
      : focus.length ? `Hands-on experience with ${listJoin(focus)}, targeting ${roleNoun(job.title)} roles.` : `Targeting ${roleNoun(job.title)} roles.`,
    ...summary,
  ] });
  if (fit.student) for (const s of bySection('education')) sections.push({ title: s.title || 'Education', lines: s.lines });

  const original = bySection('skills').flatMap(s => s.lines).join(', ').replace(BULLET, '');
  const relevant = [...new Set([...lead, ...extraSkills])].map(pretty);
  const others = parsed.skills.filter(s => !lead.includes(s) && !extraSkills.includes(s)).map(pretty);
  const extraOriginal = original.split(/[,;|•\n]/).map(s => s.replace(/^[^:]*:\s*/, '').trim()).filter(s => s && s.length < 40 && ![...relevant, ...others].some(r => r.toLowerCase() === s.toLowerCase()));
  sections.push({ title: 'Skills', lines: [
    relevant.length ? `Relevant to this role: ${relevant.join(', ')}` : '',
    [...others, ...extraOriginal].length ? `Also: ${[...others, ...extraOriginal].join(', ')}` : '',
  ].filter(Boolean) });

  for (const key of ORDER.slice(2)) {
    if (fit.student && key === 'education') continue;
    for (const s of bySection(key)) sections.push({ title: s.title || key, lines: reorderBullets(s.lines, hits) });
  }
  for (const s of parsed.sections) if (!ORDER.includes(s.key) && s.key !== 'header') sections.push({ title: s.title, lines: s.lines });
  // Resumes without recognisable headings: keep everything after the header block.
  if (sections.length === 2 + (fit.student ? bySection('education').length : 0)) {
    const body = parsed.sections.find(s => s.key === 'header')?.lines.slice(3) || [];
    if (body.length) sections.push({ title: 'Experience', lines: reorderBullets(body, hits) });
  }

  return {
    name: profile.name || 'Your Name',
    contact: [profile.email, profile.phone, profile.location, profile.linkedin, profile.site].filter(Boolean).join('  |  '),
    sections,
  };
}

// Within each job/project entry, put the bullets that hit the posting's keywords first.
function reorderBullets(lines, hits) {
  const out = [];
  let bullets = [];
  const flush = () => { out.push(...bullets.map((b, i) => [b, hits(b), i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]).map(x => x[0])); bullets = []; };
  for (const l of lines) {
    if (BULLET.test(l)) bullets.push(l);
    else if (bullets.length && /^[a-z(]/.test(l)) bullets[bullets.length - 1] += ' ' + l; // wrapped bullet line
    else { flush(); out.push(l); }
  }
  flush();
  return out;
}

const roleNoun = t => t.replace(/\(.*?\)|[-–,|].*$/g, '').trim();
const listJoin = a => a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;

// jsPDF's built-in fonts only cover Windows-1252.
const safe = s => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[▪◦●■►‣]/g, '•').replace(/[^\x00-\xFF•–—€…]/g, '');

export function resumePdf(doc) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), M = 46;
  let y = M;
  const need = h => { if (y + h > H - M) { pdf.addPage(); y = M; } };

  pdf.setFont('helvetica', 'bold').setFontSize(19);
  pdf.text(safe(doc.name), W / 2, y + 6, { align: 'center' });
  y += 24;
  pdf.setFont('helvetica', 'normal').setFontSize(9.2).setTextColor(70);
  for (const l of pdf.splitTextToSize(safe(doc.contact), W - 2 * M)) { pdf.text(l, W / 2, y, { align: 'center' }); y += 12; }
  pdf.setTextColor(0);
  y += 4;

  for (const s of doc.sections) {
    if (!s.lines.length) continue;
    need(34);
    y += 8;
    pdf.setFont('helvetica', 'bold').setFontSize(10.5);
    pdf.text(safe(s.title).toUpperCase(), M, y);
    pdf.setLineWidth(0.6).line(M, y + 4, W - M, y + 4);
    y += 17;
    for (const raw of s.lines) {
      const isBullet = BULLET.test(raw);
      const text = safe(raw.replace(BULLET, ''));
      const isHead = !isBullet && raw.length < 95 && (/(19|20)\d{2}|present/i.test(raw) || /^[A-Z][^.]*$/.test(raw)) && s.title !== 'Summary' && s.title !== 'Skills';
      pdf.setFont('helvetica', isHead ? 'bold' : 'normal').setFontSize(9.8);
      const indent = isBullet ? 12 : 0;
      const wrapped = pdf.splitTextToSize(text, W - 2 * M - indent);
      need(wrapped.length * 12.5);
      if (isBullet) pdf.text('•', M + 2, y);
      for (const w of wrapped) { pdf.text(w, M + indent, y); y += 12.5; }
      if (isHead) y += 1;
    }
  }
  return pdf;
}

export function resumeText(doc) {
  return [doc.name, doc.contact, '', ...doc.sections.flatMap(s => [s.title.toUpperCase(), ...s.lines, ''])].join('\n');
}

export function coverLetter(profile, job, fit, edu = {}) {
  const skills = fit.matched.slice(0, 4).map(pretty);
  if (fit.student) return `Dear ${job.company} recruiting team,

I'm ${edu.major ? `a ${edu.major} student` : 'a student'}${edu.school ? ` at ${edu.school}` : ''}${edu.gradYear ? `, graduating in ${edu.gradYear}` : ''}, and I'm applying for the ${job.title} position${job.term ? ` for ${job.term.split(',')[0]}` : ''}. ${skills.length ? `Through my coursework and projects I've built hands-on experience with ${listJoin(skills)}, which this internship uses directly.` : 'This internship lines up closely with what I have been studying and building.'}

[One sentence on your best project, class or club result that is relevant to this role.]

[One sentence on why ${job.company} specifically: what you want to learn there.]

My resume is attached. I'd love the chance to learn from your team and contribute this ${job.term ? job.term.split(' ')[0].toLowerCase() : 'term'}. Thank you for considering me.

Sincerely,
${profile.name || ''}
${[profile.email, profile.phone].filter(Boolean).join(' · ')}`;
  return `Dear ${job.company} hiring team,

I'm applying for the ${job.title} role. ${skills.length ? `My background in ${listJoin(skills)} lines up closely with what this position calls for, ` : 'My background lines up closely with what this position calls for, '}and I'd welcome the chance to bring that to ${job.company}.

[One sentence on your strongest result that is relevant to this role.]

[One sentence on why ${job.company} specifically: its product, mission or team.]

I've attached my resume and would be glad to talk about how I can help. Thank you for your time.

Sincerely,
${profile.name || ''}
${[profile.email, profile.phone].filter(Boolean).join(' · ')}`;
}

export function applicationAnswers(profile, job, fit, edu = {}) {
  const [first, ...rest] = (profile.name || '').split(' ');
  const student = fit.student ? {
    School: edu.school, 'Degree / major': [edu.degree, edu.major].filter(Boolean).join(', '),
    'Expected graduation': edu.gradYear ? String(edu.gradYear) : '', GPA: edu.gpa,
    'Internship term': job.term || '',
  } : {};
  return {
    ...student,
    'First name': first || '', 'Last name': rest.join(' '), Email: profile.email, Phone: profile.phone,
    Location: profile.location, LinkedIn: profile.linkedin, 'Website / GitHub': profile.site,
    'Authorized to work': /authorized/i.test(profile.auth || '') ? 'Yes' : 'No',
    'Requires sponsorship': /sponsor/i.test(profile.auth || '') ? 'Yes' : 'No',
    [`Why ${job.company}?`]: `I'm drawn to ${job.company} because this ${job.title} role uses the skills I've built the most${fit.matched.length ? `, especially ${listJoin(fit.matched.slice(0, 3).map(pretty))}` : ''}, and I want my work to have a direct impact on the product.`,
  };
}

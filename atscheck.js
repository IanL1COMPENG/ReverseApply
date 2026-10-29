// Checks a tailored resume PDF the way a screening system sees it: the PDF is read back as text, parsed
// again, and scored again with the same rules as every job card. Nothing is judged from the editor's text.
import { spellingIn, pretty } from './skills.js';

const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (text, phrase) => new RegExp(`(?:^|[^a-z0-9])${reEsc(phrase.toLowerCase()).replace(/\s+/g, '\\s+')}(?:$|[^a-z0-9])`, 'i').test(text);
const words = t => (t.match(/[A-Za-z0-9+#]+/g) || []).length;

// pdfText: text read back from the PDF. parsed: parseResume(pdfText). docText: what was put into the PDF.
// before / after: the job's fit for the original resume and for the read-back PDF.
export function atsReport({ pdfText, parsed, docText, job, before, after, profile = {}, student = false }) {
  const checks = [];
  const add = (ok, good, bad) => checks.push({ ok, text: ok ? good : bad });
  const lost = 1 - words(pdfText) / Math.max(1, words(docText));
  add(lost < 0.04, 'All of your text comes through when the PDF is read', `${Math.round(lost * 100)}% of the words did not come through when the PDF was read: check for unusual symbols`);
  for (const [label, v] of [['Name', profile.name], ['Email', profile.email], ['Phone', profile.phone]]) if (v) add(has(pdfText, v), `${label} reads correctly`, `${label} "${v}" did not read back as written`);
  const keys = new Set(parsed.sections.map(s => s.key));
  for (const [k, label] of [['experience', 'Experience'], ['education', 'Education'], ['skills', 'Skills']]) {
    if (new RegExp(`^${label}`, 'im').test(docText)) add(keys.has(k), `"${label}" section is recognized`, `"${label}" section is not recognized by the parser`);
  }
  if (student && profile.grad) add(!!parsed.education?.gradYear && profile.grad.includes(String(parsed.education.gradYear)), `Graduation date reads as ${parsed.education?.gradDate || profile.grad}`, `Graduation date did not read back as "${profile.grad}"`);
  const lostSkills = (before.matched || []).filter(s => !parsed.skills.includes(s));
  add(!lostSkills.length, `All ${before.matched?.length || 0} matching skills are found in the PDF`, `Skills on your resume but not found in the PDF: ${lostSkills.map(pretty).join(', ')}`);

  // Keywords as this posting writes them: an exact match is what keyword filters compare.
  const jobText = `${job.title}\n${job.desc || ''}`;
  const kw = [];
  for (const s of new Set([...(after.matched || []), ...(before.matched || [])])) {
    const word = spellingIn(s, jobText) || pretty(s);
    kw.push({ word, status: has(pdfText, word) ? 'exact' : parsed.skills.includes(s) ? 'close' : 'missing' });
  }
  for (const s of after.missing || []) kw.push({ word: spellingIn(s, jobText) || pretty(s), status: 'missing' });
  // Phrases already covered by a keyword above ("BLS certification" when BLS is listed) are not repeated.
  const phrases = [...new Set([...(after.wording?.hit || []), ...(after.wording?.near || []), ...(after.wording?.miss || [])])]
    .filter(p => !kw.some(k => has(p, k.word)))
    .map(p => ({ word: p, status: has(pdfText, p) ? 'exact' : 'missing' }));

  const exact = kw.filter(k => k.status === 'exact').length;
  return {
    checks, keywords: kw, phrases,
    score: after.score, before: before.score,
    summary: `${exact} of ${kw.length} posting keywords appear word for word`,
    passed: checks.filter(c => c.ok).length,
  };
}

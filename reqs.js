// Splits a job posting into must-haves and nice-to-haves, then checks each line against the resume's
// skills, projects and experience. Eligibility lines (GPA, degree, work authorization, location) are
// scored elsewhere; soft-skill lines ("team player") can't be proven from a resume and are not counted.
import { extractSkills } from './skills.js';

const BULLET = /^\s*(?:[*•\-–▪◦●■►‣]|\d{1,2}[.)])\s+/;
const clean = l => l.replace(/\*\*|__|^#+\s*/g, '').replace(BULLET, '').replace(/[’‘]/g, "'").trim();

const MUST_HEAD = /^(?:(?:minimum|basic|required|key|position|job|core|technical)\s+)?(?:qualifications?|requirements?)(?:\s*\/\s*(?:qualifications?|requirements?))?$|^(?:required|must[- ]have)\s+(?:skills|experience|qualifications)|^what (?:you'?ll|you will|you) (?:need|bring)|^what we(?:'re| are) looking for|^(?:you have|you bring|you should have|you'?ll have|about you|who you are|must[- ]haves?|skills (?:&|and) (?:experience|qualifications)|your (?:skills|background|experience|profile)|ideal candidate|requirements and qualifications|qualifications and requirements)/i;
const NICE_HEAD = /^(?:preferred|desired|desirable|bonus|additional|nice[- ]to[- ]haves?|pluses|extra credit|good to have|it'?s a plus|even better|ideally)/i;
const OTHER_HEAD = /^(?:responsibilities|key responsibilities|duties|what (?:you'?ll|you will) (?:do|learn|gain)|a day in|day to day|about (?:the (?:role|team|company|job)|us|our)|benefits|perks|compensation|pay|salary|eligibility|location|who we are|our (?:team|mission|company)|why (?:join|you'?ll love)|the role|role overview|job (?:summary|description)|overview|equal (?:employment|opportunity)|how to apply|additional information|the opportunity|what we offer)/i;
const NICE_INLINE = /\b(?:a (?:big |huge )?plus|is a plus|an advantage|advantageous|preferred|nice to have|bonus|desirable|ideally|not required|helpful but)\b/i;
const MUST_INLINE = /\b(?:required|must have|must be|mandatory|minimum|essential)\b/i;

// Not skill requirements: eligibility, logistics and school status (handled by the other checks).
const SKIP = /\b(?:gpa|grade point|degree|pursuing|enrolled|attending|matriculat\w*|majors?|graduat\w*|class of|sophomores?|juniors?|seniors?|upperclass\w*|freshm[ae]n|authoriz\w*|visa|sponsor\w*|citizen\w*|u\.s\. person|relocat\w*|transportation|background (?:check|investigation)|drug|commute|on-?site|in[- ]office|hybrid|located|locations?|available to work|availability|hours per week|full[- ]time|part[- ]time|start date|18 years|legal(?:ly)?|returning students|export)\b/i;
const SOFT = /\b(?:communicat\w*|interpersonal|team(?:mate|work| player)?s?|collaborat\w*|detail\w*|organized|organizational|self-?starter|motivated|motivation|passion\w*|curious|curiosity|eager\w*|willing\w*|learn\w*|fast[- ]paced|initiative|independent\w*|work ethic|adaptab\w*|agile|attitude|problem[- ]solv\w*|analytical|critical thinking|creative|creativity|multitask\w*|time management|professional\w*|integrity|positive|enthusias\w*|driven|ownership|mindset|aptitude|excellence|strives?|desire|leadership|leader|people|environment|business needs|change|shift|frequently|ever-changing|others|approach|demonstrated|excellent|strong|great|good|ability|able|highly|self|works?|well)\b/gi;
const STOP = new Set('a an and or the of to in on for with at by from as is are be been being this that these those it its your you our we they their them who what which will would can could should may might must have has had do does did not no yes any all some such other more most very also than then into onto over under about across within without per via etc e.g i.e including include includes using use used experience experienced knowledge knowledgeable understanding familiarity familiar proficiency proficient skills skill skilled working work ability abilities strong solid excellent good great demonstrated proven related relevant years year plus least one two three minimum preferred required level basic advanced intermediate expert concepts principles practices tools tool technologies technology platforms platform systems system methods'.split(' '));
const SOFT_SKILL_NAMES = new Set(['communication', 'leadership', 'team leadership', 'collaboration', 'problem solving', 'critical thinking', 'time management', 'attention to detail', 'analytical skills', 'presentation', 'public speaking', 'mentoring', 'strategic planning', 'decision making', 'cross-functional', 'agile']);

// Requirements phrased as concepts rather than named tools.
const LANGS = ['python', 'java', 'javascript', 'typescript', 'c++', 'c#', 'go', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'scala', 'r', 'matlab', 'sql'];
const CONCEPTS = [
  { req: /\b(?:programming|coding|software development|object[- ]oriented)\b|\bprogramming languages?\b/i, has: r => r.skills.some(s => LANGS.includes(s)), label: 'programming' },
  { req: /\bmicrosoft (?:office|products|365|suite)\b|\bms office\b|\bgoogle (?:suite|workspace)\b|\bspreadsheets?\b/i, has: r => r.skills.some(s => ['excel', 'google sheets', 'vba'].includes(s)) || /\b(word|powerpoint|outlook|microsoft|office 365|google (docs|sheets|slides))\b/i.test(r.text), label: 'office tools' },
  { req: /\badobe (?:creative (?:suite|cloud))\b|\bcreative suite\b/i, has: r => r.skills.some(s => ['photoshop', 'illustrator', 'indesign', 'after effects', 'premiere pro', 'adobe xd'].includes(s)) || /\badobe|canva\b/i.test(r.text), label: 'design tools' },
  { req: /\bsocial media\b/i, has: r => r.skills.includes('social media') || /\b(instagram|tiktok|facebook|linkedin content|twitter|social media)\b/i.test(r.text), label: 'social media' },
  { req: /\bdata (?:analysis|analytics)\b|\banalyz\w* data\b/i, has: r => r.skills.some(s => ['data analysis', 'excel', 'sql', 'python', 'tableau', 'power bi', 'r', 'statistics'].includes(s)), label: 'data analysis' },
  { req: /\bwriting\b|\bwritten\b|\bcopy ?writing\b|\bcontent creation\b|\bcreate content\b/i, has: r => r.skills.some(s => ['copywriting', 'content marketing'].includes(s)) || /\b(wrote|writ(e|ing)|blog|articles?|copy|content|publish\w*)\b/i.test(r.text), label: 'writing' },
  { req: /\bmachine learning\b|\bml\b/i, has: r => r.skills.some(s => ['machine learning', 'pytorch', 'tensorflow', 'scikit-learn', 'deep learning'].includes(s)), label: 'machine learning' },
  { req: /\balgorithms?\b|\bdata structures\b/i, has: r => r.skills.some(s => ['algorithms', 'data structures'].includes(s)) || /\b(algorithms?|data structures)\b/i.test(r.text), label: 'algorithms' },
  { req: /\bcustomer[- ](?:facing|service)\b|\bclient[- ]facing\b/i, has: r => r.skills.some(s => ['customer service', 'customer support', 'sales', 'account management'].includes(s)) || /\b(customers?|clients?|guests?)\b/i.test(r.text), label: 'customer-facing work' },
];

const stem = w => w.replace(/(?:ing|ers|er|ed|ies|es|s|ly|al|ment|ments|tion|tions)$/, '').slice(0, 7);

function kindOfHeading(raw) {
  const t = clean(raw).replace(/:$/, '').trim();
  if (!t || t.length > 70 || BULLET.test(raw)) return null;
  const looksLikeHeading = /:$/.test(clean(raw)) || /^\*\*.*\*\*:?$/.test(raw.trim()) || /^#+\s/.test(raw.trim()) || (t === t.toUpperCase() && /[A-Z]/.test(t)) || t.split(/\s+/).length <= 6;
  if (!looksLikeHeading) return null;
  if (NICE_HEAD.test(t)) return 'nice';
  if (MUST_HEAD.test(t)) return 'must';
  if (OTHER_HEAD.test(t)) return 'other';
  return null;
}

export function parseRequirements(desc = '') {
  const must = [], nice = [];
  let mode = null;
  for (const raw of desc.split('\n')) {
    if (!raw.trim()) continue;
    const head = kindOfHeading(raw);
    if (head) { mode = head === 'other' ? null : head; continue; }
    const text = clean(raw);
    const isBullet = BULLET.test(raw);
    // Any other short heading-like line ("Why Pilot Company?", "Benefits") ends the requirements section.
    if (!isBullet && text.split(/\s+/).length <= 8 && !/\.$/.test(text) && (/[?:]$/.test(text) || /^(?:[A-Z][\w'&-]*\s*){1,8}$/.test(text))) { mode = null; continue; }
    if (text.length < 12 || text.length > 400 || /\]\(|https?:\/\//.test(raw)) continue;
    // Long lines are checked one sentence at a time, so "Excel and SQL are essential. X is a plus." is two items.
    // Later sentences keep the line's label ("Soft Skills: ...") so they are judged the same way.
    const lab = (text.match(/^([A-Z][A-Za-z &/-]{2,30}):\s+/) || [])[1];
    const sentences = (text.length > 140 ? text.split(/(?<=[.!?])\s+(?=[A-Z])/) : [text]).map((s, i) => (i && lab ? `${lab}: ${s}` : s));
    for (const s of sentences) {
      let kind = null;
      if (mode && (isBullet || text.length < 250)) kind = NICE_INLINE.test(s) && !MUST_INLINE.test(s) ? 'nice' : mode;
      else if (isBullet && NICE_INLINE.test(s)) kind = 'nice';
      else if (isBullet && MUST_INLINE.test(s)) kind = 'must';
      if (kind && s.length >= 12) (kind === 'must' ? must : nice).push(s.slice(0, 220));
    }
  }
  return { must: must.slice(0, 15), nice: nice.slice(0, 12) };
}

// met / partial / missing, or "soft" (not something a resume can prove) / "eligibility" (checked elsewhere).
export function checkLine(full, resume) {
  // A leading label says what kind of line it is: "Education: ...", "Soft Skills: ...", "Technical Skills: ...".
  const lab = full.match(/^([A-Z][A-Za-z &/-]{2,30}):\s+/);
  if (lab && /soft|qualit|trait|personal|attribute|character|mindset/i.test(lab[1])) return { status: 'soft' };
  if (lab && /education|degree|eligib|academic|school|availability|location/i.test(lab[1])) return { status: 'eligibility' };
  const line = lab ? full.slice(lab[0].length) : full;
  if (SKIP.test(line)) return { status: 'eligibility' };
  const text = (resume.text || '').toLowerCase();
  const hard = extractSkills(line).filter(s => !SOFT_SKILL_NAMES.has(s));
  const concepts = CONCEPTS.filter(c => c.req.test(line) && !hard.some(h => c.label.includes(h)));
  if (hard.length || concepts.length) {
    const units = [...hard.map(s => ({ name: s, ok: resume.skills.includes(s) })), ...concepts.map(c => ({ name: c.label, ok: c.has(resume) }))];
    const got = units.filter(u => u.ok).length;
    const anyOf = /\b(?:or|any|at least one|one of|such as|e\.g\.?|for example|like)\b/i.test(line);
    const status = got === 0 ? 'missing' : anyOf || got / units.length >= 0.67 ? 'met' : 'partial';
    return { status, have: units.filter(u => u.ok).map(u => u.name), lack: units.filter(u => !u.ok).map(u => u.name) };
  }
  // Mostly personality words ("fast learner, highly motivated, good communication"): not provable from a resume.
  const softHits = (line.match(SOFT) || []).length;
  const words = [...new Set(line.toLowerCase().replace(SOFT, ' ').split(/[^a-z+#]+/).filter(w => w.length >= 4 && !STOP.has(w)))];
  if (softHits >= 3 && softHits >= words.length / 2) return { status: 'soft' };
  // A single named tool ("Familiarity with Hootsuite") is still a real requirement.
  const named = (line.match(/\b[A-Z][a-zA-Z0-9+#.]{2,}\b/g) || []).filter(w => words.includes(w.toLowerCase()) && !/^(Experience|Familiarity|Knowledge|Proficiency|Strong|Excellent|Ability|Understanding)$/.test(w));
  if (words.length < 2 && !named.length) return { status: 'soft' };
  const found = words.filter(w => new RegExp(`\\b${stem(w).replace(/[+#]/g, '\\$&')}`).test(text));
  const ratio = found.length / words.length;
  return { status: ratio >= 0.6 ? 'met' : ratio >= 0.3 ? 'partial' : 'missing', have: found, lack: words.filter(w => !found.includes(w)) };
}

// Overall requirement fit for scoring: null when the posting has no recognisable requirements.
export function requirementFit(desc, resume) {
  const { must, nice } = parseRequirements(desc);
  if (!must.length && !nice.length) return null;
  const rate = items => {
    const counted = items.filter(i => ['met', 'partial', 'missing'].includes(i.status));
    return counted.length ? { n: counted.length, met: counted.filter(i => i.status === 'met').length, partial: counted.filter(i => i.status === 'partial').length, score: counted.reduce((a, i) => a + (i.status === 'met' ? 1 : i.status === 'partial' ? 0.5 : 0), 0) / counted.length } : null;
  };
  const mustItems = must.map(text => ({ text, ...checkLine(text, resume) }));
  const niceItems = nice.map(text => ({ text, ...checkLine(text, resume) }));
  return { must: mustItems, nice: niceItems, mustRate: rate(mustItems), niceRate: rate(niceItems) };
}

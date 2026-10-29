// Splits a job posting into must-haves and nice-to-haves, then checks each line against the resume's
// skills, projects and experience. Eligibility lines (GPA, degree, work authorization, location) are
// scored elsewhere; soft-skill lines ("team player") can't be proven from a resume and are not counted.
import { extractSkills } from './skills.js';

const BULLET = /^\s*(?:[*•\-–▪◦●■►‣]|\d{1,2}[.)])\s+/;
const clean = l => l.replace(/&nbsp;|&#xa0;| /g, ' ').replace(/&amp;/g, '&').replace(/\*\*|__|^#+\s*/g, '').replace(BULLET, '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();

// Section headings. "Required / Minimum / Basic Qualifications", "What we need to see", "You may be a good fit if
// you have" are must-haves; "Preferred Qualifications", "Bonus points", "Strong candidates may also have" are
// nice-to-haves. Headings about the job itself, pay or paperwork end the requirements.
const OTHER_HEAD = /^(?:(?:key |primary |your |job |essential )?responsibilit\w*|duties|what (?:you'?ll|you will|you'?d) (?:do|learn|gain|work on|be doing)|the experience you'?ll gain|a day in|day[- ]to[- ]day|about (?:the (?:role|team|company|job|position|program|internship)|us|our|(?!you\b)\w+$)|benefits|perks|compensation|pay\b|salary|location|who we are|our (?:team|mission|company|values|culture|benefits)|why (?:join|work|you'?ll love)|the role|role (?:overview|summary)|job (?:summary|description|overview)|position (?:summary|overview)|overview|equal (?:employment|opportunity)|eeo|how to apply|additional information|the opportunity|what we offer|internship (?:experience|details|program details)|program details|schedule|travel)|\b(?:physical|citizenship|clearance|itar|ear|security|travel|work authori[sz]ation|visa|background check) requirements?\b|\bcompensation\b|\bbenefits\b/i;
const NICE_WORDS = /\b(?:prefer\w*|desired|desirable|bonus|nice[- ]to[- ]haves?|pluses|a plus|added plus|is a plus|extra credit|good to have|even better|ideally|not required|helpful|may also have|might also have|would be great|stand out|differentiators?|advantage\w*)\b/i;
const MUST_WORDS = /\b(?:qualifications?|requirements?|required|require|must[- ]haves?|must have|minimum|basic|essential|need to see|you(?:'ll| will)? need|what you need|need to have|looking for|you have|you bring|you are|you'?re|who you are|about you|ideal candidate|ideal qualifications|good fit|great fit|fit if|ideal for this role|skills|experience|knowledge|abilities|competenc\w*|pre-?requisites|expect(?:ations)?|thrive|successful|hear from you|excited about you|candidate|profile|background|talk about you|what you(?:'ve| have) done|you should have|we want|we value)\b/i;
const kindOfHeadingText = t => (OTHER_HEAD.test(t) ? 'other' : NICE_WORDS.test(t) ? 'nice' : MUST_WORDS.test(t) ? 'must' : null);
const NICE_INLINE = /\b(?:a (?:big |huge )?plus|is a plus|an advantage|advantageous|preferred|nice to have|bonus|desirable|ideally|not required|helpful but)\b/i;
const MUST_INLINE = /\b(?:required|must have|must be|mandatory|minimum|essential)\b/i;

// Not skill requirements: eligibility, logistics and school status (handled by the other checks).
const SKIP = /\b(?:gpa|grade point|degree|pursuing|enrolled|attending|matriculat\w*|majors?|graduat\w*|class of|sophomores?|juniors?|seniors?|upperclass\w*|freshm[ae]n|authoriz\w*|visa|sponsor\w*|citizen\w*|u\.?s\.? persons?|permanent residen\w*|green card|clearances?|cleared|polygraph|ts\/sci|itar|ear\b|export control\w*|relocat\w*|transportation|background (?:check|investigation|screening)|drug (?:test|screen)\w*|commute|on-?site|in[- ]office|hybrid|located|locations?|available to work|availability|hours per week|full[- ]time|part[- ]time|start date|18 years|21 years|years of age|legal(?:ly)?|returning students|export|driver'?s licen[cs]e|valid licen[cs]e|lift (?:up to )?\d+|\d+\s*(?:lbs?|pounds)|stand(?:ing)? for|postures?|kneel\w*|squat\w*|bend(?:ing)?|physical(?:ly)? (?:able|demands?|requirements?)|weekends?|evenings?|overtime|shifts?|on[- ]call|travel up to|\d+%\s*travel|vaccinat\w*)\b/i;

// ---------- eligibility: things the posting requires of you that a resume never shows ----------
// Each is checked against the profile (citizenship status, clearance, driver's license), never the resume.
const ELIGIBILITY = [
  { kind: 'citizenship', re: /\b(?:u\.?s\.?|united states) citizen(?:ship)?\b|\bcitizenship (?:is )?required\b|\bu\.?s\.? persons?\b|\bitar\b|\bexport control\w*\b|\bpermanent residents?\b|\bgreen card\b/i },
  { kind: 'clearance', re: /\b(?:security|secret|top secret|ts\/sci|dod|public trust|government|federal|active)\s+clearance\b|\bclearance (?:is )?required\b|\bpolygraph\b|\bts\/sci\b/i },
  { kind: 'sponsorship', re: /\b(?:not|unable to|cannot|won'?t|will not|does not|do not)\s+(?:provide\s+|offer\s+)?(?:visa\s+)?sponsor\w*|\bwithout (?:the need for |current or future )?(?:visa )?sponsorship\b|\bno (?:visa )?sponsorship\b/i },
  { kind: 'authorization', re: /\b(?:legally )?authorized to work in the (?:u\.?s\.?|united states)\b|\bwork authorization\b/i },
  { kind: 'license', re: /\bdriver'?s licen[cs]e\b|\bvalid (?:state )?(?:driver'?s )?licen[cs]e\b|\bclean driving record\b|\bown (?:reliable )?(?:vehicle|transportation)\b/i },
  { kind: 'age', re: /\b(?:at least |must be )?(?:18|21) years (?:of age|old)\b|\b(?:18|21)\+ years of age\b/i },
  { kind: 'screening', re: /\bbackground (?:check|investigation|screening)\b|\bdrug (?:test|screen)\w*\b/i },
  { kind: 'physical', re: /\blift (?:up to )?\d+\s*(?:lbs?|pounds)\b|\bstand(?:ing)? for (?:long|extended) periods\b/i },
  { kind: 'schedule', re: /\b(?:nights|weekends|evenings|holidays|overtime|on[- ]call|rotating shifts?)\b|\btravel (?:up to )?\d+%|\d+%\s*travel\b/i },
];
const CITIZEN_OK = /\bpermanent residents?\b|\bgreen card\b|\bu\.?s\.? persons?\b|\bitar\b|\bexport control/i;

// What the posting requires and how you stand on each: ok / no / check (needs your answer) / info.
export function eligibilityChecks(desc = '', who = {}) {
  const status = (who.auth || '').toLowerCase();
  const citizen = /citizen/.test(status), resident = /permanent|green/.test(status), needsSponsor = /sponsor/.test(status), abroad = /other country|outside/.test(status);
  const out = [], seen = new Set();
  // "U.S. citizen" must not be split into two sentences at "U.S.".
  for (const raw of desc.replace(/\b([A-Z])\.([A-Z])\.(?=\s)/g, '$1.$2').split(/\n+|(?<=[.!?;])\s+/)) {
    const s = raw.replace(/\s+/g, ' ').replace(/^[\s•▪◦●■►‣*–-]+|[\s•▪◦●■►‣*]+$/g, '').replace(/\b([A-Z])\.([A-Z])(?=\s)/g, '$1.$2.').trim();
    if (s.length < 8 || s.length > 400) continue;
    for (const e of ELIGIBILITY) {
      if (seen.has(e.kind) || !e.re.test(s)) continue;
      // "Preferred" or "ability to obtain" requirements are softer than "must have an active clearance".
      const soft = /\b(?:prefer\w*|a plus|nice to have|ability to obtain|able to obtain|eligib\w* (?:to|for) obtain|willing(?:ness)? to obtain)\b/i.test(s);
      let st = 'info', note = '';
      if (e.kind === 'citizenship') {
        const accepted = citizen || (resident && CITIZEN_OK.test(s));
        st = accepted ? 'ok' : status && !/authorized to work in the us$/.test(status) ? 'no' : 'check';
        const who2 = CITIZEN_OK.test(s) ? 'U.S. citizens or permanent residents' : 'U.S. citizens';
        note = accepted ? `${who2} only: you qualify` : st === 'no' ? `${who2} only; your profile says ${who.auth}` : `${who2} only: set your citizenship status in step 1`;
      } else if (e.kind === 'clearance') {
        st = who.clearance ? 'ok' : soft ? (citizen ? 'ok' : 'check') : 'no';
        note = who.clearance ? 'You have an active clearance' : soft ? 'You must be able to get a security clearance (usually U.S. citizens)' : 'Needs an active security clearance';
      } else if (e.kind === 'sponsorship') {
        st = needsSponsor || abroad ? 'no' : 'ok'; note = st === 'no' ? 'Will not sponsor visas, and your profile says you need sponsorship' : 'You do not need sponsorship';
      } else if (e.kind === 'authorization') {
        st = abroad ? 'no' : needsSponsor ? 'check' : 'ok'; note = st === 'ok' ? 'You are authorized to work in the U.S.' : st === 'no' ? 'Must be authorized to work in the U.S.' : 'Needs U.S. work authorization: ask whether they sponsor';
      } else if (e.kind === 'license') {
        st = who.license ? 'ok' : 'check'; note = who.license ? 'You have a driver\'s license' : 'Needs a driver\'s license: tick it in step 1 if you have one';
      } else note = { age: 'Age requirement', screening: 'They run a background check or drug screen', physical: 'Physical requirement', schedule: 'Schedule or travel requirement' }[e.kind] || '';
      if (soft && st === 'no' && e.kind !== 'sponsorship') st = 'check';
      seen.add(e.kind);
      out.push({ kind: e.kind, text: s.slice(0, 200), status: st, note });
    }
  }
  return out;
}
const SOFT = /\b(?:communicat\w*|interpersonal|team(?:mate|work| player)?s?|collaborat\w*|detail\w*|organized|organizational|self-?starter|motivated|motivation|passion\w*|curious|curiosity|eager\w*|willing\w*|learn\w*|fast[- ]paced|initiative|independent\w*|work ethic|adaptab\w*|agile|attitude|problem[- ]solv\w*|analytical|critical thinking|creative|creativity|multitask\w*|time management|professional\w*|integrity|positive|enthusias\w*|driven|ownership|mindset|aptitude|excellence|strives?|desire|leadership|leader|people|environment|business needs|change|shift|frequently|ever-changing|others|approach|demonstrat\w*|excellent|strong|great|good|ability|able|highly|self|works?|well|proactiv\w*|organi[sz]e\w*|prioriti\w*|can[- ]do|orient\w*|competence|intercultural|punctual\w*|reliab\w*|dependab\w*|friendly|patien(?:ce|t with)|caring|compassion\w*|empath\w*|flexib\w*|multi-?task\w*|resourceful\w*|accountab\w*|outgoing|energetic|personable|courteous|respectful|team-?oriented|results-?(?:oriented|driven)|customer-?focused|written|verbal|oral|expert)\b/gi;
const STOP = new Set('a an and or the of to in on for with at by from as is are be been being this that these those it its your you our we they their them who what which will would can could should may might must have has had do does did not no yes any all some such other more most very also than then into onto over under about across within without per via etc e.g i.e including include includes using use used experience experienced knowledge knowledgeable understanding familiarity familiar proficiency proficient skills skill skilled working work ability abilities strong solid excellent good great demonstrated proven related relevant years year plus least one two three minimum preferred required level basic advanced intermediate expert concepts principles practices tools tool technologies technology platforms platform systems system methods'.split(' '));
// Words around a years-of-experience requirement that say nothing about the field.
const YEAR_FILLER = new Set('field fields area areas including include internship internships co-op coop equivalent similar setting environment role roles position progressive professional hands-on combination education degree training'.split(' '));
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
  { req: /\bcustomer[- ](?:facing|service)\b|\bclient[- ]facing\b/i, has: r => r.skills.some(s => ['customer service', 'customer support', 'sales', 'account management'].includes(s)) || /\b(customers?|clients?|guests?|patients?|families|parents|students|children|visitors|members|the public|patrons)\b/i.test(r.text), label: 'customer-facing work' },
];
const LANGUAGES = /\b(english|spanish|french|german|mandarin|chinese|cantonese|japanese|korean|portuguese|italian|arabic|hindi|russian|vietnamese|tagalog|polish|dutch|turkish|hebrew|american sign language|asl)\b/gi;
// "Willing to obtain a CPA", "planning to attain", "or willingness to obtain": a commitment, not a resume line.
const INTENT = /\b(?:planning to|plan to|intend\w* to|willing(?:ness)? to (?:obtain|attain|earn|get|pursue|complete)|(?:willingness|ability) to obtain|obtain\w* within|attain\w* within)\b/i;

const stem = w => w.replace(/(?:ing|ers|er|ed|ies|es|s|ly|al|ment|ments|tion|tions)$/, '').slice(0, 7);

function kindOfHeading(raw) {
  const c = clean(raw);
  const t = c.replace(/[:\s]+$/, '').replace(/^[^A-Za-z0-9]+/, '').trim();
  if (!t || BULLET.test(raw)) return null;
  const words = t.split(/\s+/).length;
  // "Qualifications", "REQUIRED", "**What we need to see:**", "To be successful in this position you will need:"
  const looksLikeHeading = (/:$/.test(c) && words <= 16) || (/^\*\*.*\*\*:?$/.test(raw.trim()) && words <= 12) || /^#+\s/.test(raw.trim()) || (t === t.toUpperCase() && /[A-Z]/.test(t) && words <= 10) || (words <= 7 && !/[.!]$/.test(t));
  if (!looksLikeHeading || t.length > 110) return null;
  return kindOfHeadingText(t);
}

// "Required: Python and SQL", "Preferred: experience with AWS" on a single line.
const INLINE_LABEL = /^(?:(required|minimum|basic|must[- ]haves?|requirements)|(preferred|desired|bonus(?: points)?|nice[- ]to[- ]haves?|plus(?:es)?))(?:\s+(?:qualifications?|skills|experience))?\s*:\s*(.{12,})$/i;
// Closing lines that sit under the last heading but are not requirements.
const BOILERPLATE = /equal (?:employment )?opportunity|affirmative action|\bapply (?:today|now)\b|what it takes|encourage you to apply|reasonable accommodation|e-?verify|disabilit|recruiting agenc|privacy (?:notice|policy)|\bsalary\b|\bpay range\b|\$\d|check out|ever wondered|\bvideo\b|accepted on an ongoing basis|please (?:ensure|note|upload|submit)|^note:|\bour benefits\b|benefits (?:include|package)|medical, dental|dental(?:,| and) vision|paid time off|\bpto\b|401\(?k\)?|employee assistance program|discounted|\bperks\b|wellness programs?/i;
// Bullets that state a skill or experience requirement even when no heading says so.
const REQ_START = /^(?:experience\w*|proficien\w*|knowledge|familiar\w*|strong|solid|excellent|demonstrated|understanding|ability|comfortable|hands-on|background|working knowledge|fluen\w*|exposure|expertise|skilled|competen\w*|\d+\+? years?|coursework|prior|previous|at least)\b/i;

export function parseRequirements(desc = '') {
  const must = [], nice = [], loose = [];
  let mode = null, empty = false;
  for (const raw of desc.replace(/&nbsp;|&#xa0;| /g, ' ').split('\n')) {
    if (!raw.trim()) continue;
    const inline = clean(raw).match(INLINE_LABEL);
    if (inline) { (inline[1] ? must : nice).push(inline[3].slice(0, 220)); empty = false; continue; }
    const head = kindOfHeading(raw);
    // "Requirements:" right above "Desired Qualifications" with nothing between: the list is still the requirements.
    if (head) { if (!(head === 'nice' && mode === 'must' && empty)) mode = head === 'other' ? null : head; empty = true; continue; }
    empty = false;
    const text = clean(raw);
    if (BOILERPLATE.test(text)) continue;
    const isBullet = BULLET.test(raw);
    if (!mode && isBullet && REQ_START.test(text) && text.length >= 12 && text.length <= 300) loose.push(text);
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
  // No requirements heading at all: bullets like "Experience with React" still count.
  if (!must.length) for (const t of loose) (NICE_INLINE.test(t) && !MUST_INLINE.test(t) ? nice : must).push(t.slice(0, 220));
  return { must: [...new Set(must)].slice(0, 15), nice: [...new Set(nice)].slice(0, 12) };
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
  // Languages: an English resume shows English; any other language has to be on it.
  const langs = [...new Set((line.match(LANGUAGES) || []).map(l => l.toLowerCase()))];
  if (langs.length && /\b(?:speak\w*|fluen\w*|bilingual|read|write|language|proficien\w*|native|conversational)\b/i.test(line)) {
    const need = langs.filter(l => l !== 'english');
    if (!need.length) return { status: 'met', hard: true, have: [], lack: [] };
    const have = need.filter(l => new RegExp(`\\b${l}\\b`, 'i').test(text));
    const anyOf = /\bor\b/i.test(line);
    const cap = s => s.replace(/\b\w/g, c => c.toUpperCase());
    return { status: have.length && (anyOf || have.length === need.length) ? 'met' : have.length ? 'partial' : 'missing', hard: true, have: have.map(cap), lack: need.filter(l => !have.includes(l)).map(cap) };
  }
  // "0+ years of experience in accounting", "2+ years in a clinical setting": compare years, then the field.
  const yrs = line.match(/(\d{1,2})\s*\+?\s*(?:-\s*\d+\s*)?(?:years?|yrs?)\b(?:'|’)?\s*(?:of\s+)?(?:\w+\s+){0,4}?(?:experience|exp\b|work)/i) || line.match(/\bexperience\b[^.]{0,30}?(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/i);
  if (yrs) {
    const need = +yrs[1], have = resume.years || 0;
    // "finance" should find "financial", "accounting" find "accountancy": compare word starts.
    const starts = w => new RegExp(`\\b${(w.length > 6 ? w.slice(0, 6) : stem(w)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(text);
    const named = extractSkills(line).filter(s => !SOFT_SKILL_NAMES.has(s));
    const got = named.filter(s => resume.skills.includes(s) || starts(s));
    const field = line.replace(yrs[0], ' ').toLowerCase().split(/[^a-z+#]+/).filter(w => w.length >= 4 && !STOP.has(w) && !YEAR_FILLER.has(w));
    const inField = named.length ? got.length / named.length >= 0.5 || (/\bor\b/i.test(line) && got.length > 0) : !field.length || field.some(starts);
    // Internships count toward "0-1 years"; anything more needs full-time years.
    const enough = need === 0 || have >= need || (need <= 1 && (resume.entries || []).some(e => e.kind === 'job'));
    const status = enough && inField ? 'met' : (enough || have >= need - 1) && (inField || got.length) ? 'partial' : 'missing';
    return { status, hard: named.length > 0, have: got, lack: named.filter(s => !got.includes(s)) };
  }
  const intent = INTENT.test(line);
  const hard = extractSkills(line).filter(s => !SOFT_SKILL_NAMES.has(s));
  const concepts = CONCEPTS.filter(c => c.req.test(line) && !hard.some(h => c.label.includes(h)));
  if (hard.length || concepts.length) {
    const units = [...hard.map(s => ({ name: s, ok: resume.skills.includes(s) })), ...concepts.map(c => ({ name: c.label, ok: c.has(resume) }))];
    const got = units.filter(u => u.ok).length;
    const anyOf = /\b(?:or|any|at least one|one of|such as|e\.g\.?|for example|like)\b/i.test(line);
    const status = got === 0 ? 'missing' : anyOf || got / units.length >= 0.67 ? 'met' : 'partial';
    // "CPR certification or willingness to obtain": having it is a plus, not having it is fine.
    if (intent && status !== 'met') return { status: 'soft' };
    return { status, hard: true, have: units.filter(u => u.ok).map(u => u.name), lack: units.filter(u => !u.ok).map(u => u.name) };
  }
  if (intent) return { status: 'soft' };
  // Mostly personality words ("fast learner, highly motivated, good communication"): not provable from a resume.
  const softHits = (line.match(SOFT) || []).length;
  const words = [...new Set(line.toLowerCase().replace(SOFT, ' ').split(/[^a-z+#]+/).filter(w => w.length >= 4 && !STOP.has(w)))];
  if ((softHits >= 3 && softHits >= words.length / 2) || (softHits >= 1 && softHits >= words.length)) return { status: 'soft' };
  // A single named tool ("Familiarity with Hootsuite") is still a real requirement.
  const named = (line.match(/\b[A-Z][a-zA-Z0-9+#.]{2,}\b/g) || []).filter(w => words.includes(w.toLowerCase()) && !/^(Experience|Familiarity|Knowledge|Proficiency|Strong|Excellent|Ability|Understanding)$/.test(w));
  if (words.length < 2 && !named.length) return { status: 'soft' };
  const found = words.filter(w => new RegExp(`\\b${stem(w).replace(/[+#]/g, '\\$&')}`).test(text));
  const ratio = found.length / words.length;
  // Only named things ("Hootsuite", "OCaml") are listed as missing keywords; plain words are not keywords.
  const lackNamed = [...new Set(named.filter(w => !found.includes(w.toLowerCase())))];
  return { status: ratio >= 0.6 ? 'met' : ratio >= 0.3 ? 'partial' : 'missing', have: found, lack: lackNamed };
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

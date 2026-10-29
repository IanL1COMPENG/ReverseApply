// Wording match between a resume and a posting, for any field. The skills dictionary knows tools and
// certifications; this catches everything else a screener searches for, in the posting's own words
// ("patient care", "accounts payable", "lesson plans", "event planning").

const STOP = new Set(`a about above across after again against all also am an and any are as at be because been before being below
between both but by can could did do does doing down during each either etc few for from further had has have having he her here hers
him his how i if in into is it its itself just me more most must my no nor not now of off on once only or other our ours out over own
per same she should so some such than that the their them then there these they this those through to too under until up upon us very
via was we were what when where which while who whom why will with within without would you your yours yourself
ability able across additional all applicant applicants apply applying approximately areas based benefits best candidate candidates
career careers company companies day days demonstrated desire duties eg employee employees employer employment environment equal
essential etc excellent experience experienced experiences field following full great help helping hire hiring hour hours ideal
include includes including job jobs join key knowledge level like looking make making may members minimum new offer offers one
opportunity opportunities option paid part people plus position positions preferred proven provide providing qualification
qualifications related required requirement requirements responsibilities responsibility role roles salary skill skills strong
successful support team teams time type using well work working world year years yes including ensure ensuring within various must
across able per want wants we're you'll you're it's they're etc. inc llc com www http https apply today please us also every
sure need needs needed get getting take taking want good high highly great excellent outstanding exceptional proficient
proficiency familiarity familiar understanding strong solid deep basic advanced effective effectively successfully related relevant
day-to-day fast-paced dynamic passionate motivated self-starter detail-oriented results-driven hands-on`.split(/\s+/));

// Verbs and filler that make a pair read like a fragment ("deliver care", "assigned home") rather than a
// skill phrase a screener searches for ("patient care", "accounts payable").
const FRAGMENT = new Set(`deliver delivers delivering provide provides assist assists assisting ensure ensures maintain maintains
maintaining manage manages develop develops perform performs performing help helps assigned assign supporting supports directly
responsible participate participates collaborate collaborates partner partners create creates build builds drive drives lead leads
serve serves serving complete completes completing prepare prepares follow follows handle handles meet meets review reviews
communicate communicates coordinate coordinates oversee oversees promote promotes conduct conducts identify identifies respond
responds report reports track tracks apply learn grow join own owns bring brings thrive thrives come comes first best great every
daily weekly monthly annual equal world leading local national global community customers customer clients client company's
other others new current future high wide broad overall general specific various multiple several many each`.split(/\s+/));

const WORD = /[a-z][a-z+#&.'’-]*[a-z+#]|[a-z]/g;
// A light stemmer: "scheduling", "schedules", "scheduled" all become "schedul".
const stem = w => w.length < 5 ? w : w.replace(/['’]s$/, '').replace(/(?:ational|ization|ations?|ments?|ings?|ities|ity|ies|ied|ers?|ed|es|s|ly|al)$/, '').replace(/(.)\1$/, '$1') || w;
const tokens = text => (text.toLowerCase().match(WORD) || []).map(w => w.replace(/^[.'’-]+|[.'’-]+$/g, ''));

// Lines of the posting that state what the job needs (requirements, duties): weighted above the company pitch.
const NEEDS = /^\s*(?:[•\-*▪◦●■►‣–]|\d+[.)])|\b(?:require|qualif|must|responsib|duties|you will|you'll|what you|who you|preferred|ideal|experience (?:with|in)|knowledge of|proficien|ability to|familiar)/i;
const PITCH = /\b(?:equal opportunity|eeo|benefits|401\(?k|pto|paid time off|salary|compensation|pay range|we are an?|our mission|about us|founded in|headquartered|accommodat|disabilit|veteran|privacy|e-?verify|dental|vision|insurance|discount\w*|wellness|perks|driving record|driver'?s licen[cs]e|citizen\w*|clearance|sponsor\w*|authorized to work|background check|drug (?:test|screen)|lift|pounds|lbs|years of age|speak|fluen\w*|bilingual)\b|\bread(?:,| and) write\b/i;

function phrasesOf(text, company = '', reqLines = []) {
  const uni = new Map(), bi = new Map();
  // The employer's own name ("KinderCare", "Hitachi Energy") is never a keyword you're missing.
  const own = new Set(tokens(company).filter(t => t.length > 2));
  // Phrases come from the parsed requirement lines when there are any, else from duty-like lines.
  // (Requirement lines are in the description too, so their words count a second time: that is the weighting.)
  const lines = text.split(/\n+|(?<=[.!?;:])\s+/).map(l => [l, !reqLines.length && NEEDS.test(l)]).concat(reqLines.map(l => [l, true]));
  for (const [raw, need] of lines) {
    if (PITCH.test(raw)) continue;
    const w = need ? 1.6 : 1;
    // Pairs never span punctuation: "license (Registered Nurse)" must not make "license registered".
    for (const chunk of raw.split(/[,;()/|:–—]+|\s-\s/)) {
      let prev = null;
      for (const t of tokens(chunk)) {
        if (STOP.has(t) || own.has(t) || t.length < 3 && !/^[a-z][+#]+$/.test(t) || /^\d/.test(t) || /ly$/.test(t) && t.length > 4) { prev = null; continue; }
        const s = stem(t);
        const u = uni.get(s) || { n: 0, w: 0, shown: t };
        u.n++; u.w = Math.max(u.w, w); uni.set(s, u);
        if (FRAGMENT.has(t)) { prev = null; continue; }
        if (prev && need) {
          const key = `${prev.s} ${s}`;
          const b = bi.get(key) || { n: 0, w: 0, shown: `${prev.t} ${t}`, parts: [prev.s, s] };
          b.n++; b.w = Math.max(b.w, w); bi.set(key, b);
        }
        prev = { s, t };
      }
    }
  }
  return { uni, bi };
}

function resumeIndex(text) {
  const toks = tokens(text).filter(t => !STOP.has(t)).map(stem);
  return { words: new Set(toks), pairs: new Set(toks.slice(1).map((s, i) => `${toks[i]} ${s}`)) };
}

// score: 0..1 share of the posting's important wording that the resume also uses.
// hit / miss: the posting's own phrases, most important first, for showing and for tailoring.
export function wordingFit(desc = '', resumeText = '', company = '', reqLines = [], skills = []) {
  const { uni, bi } = phrasesOf(desc, company, reqLines);
  const idx = resumeIndex(resumeText);
  // A phrase built around a skill you list ("Microsoft Excel" when you list Excel) is a hit.
  for (const s of skills) for (const t of tokens(s)) idx.words.add(stem(t));
  const skillStems = new Set(skills.flatMap(s => tokens(s).map(stem)));
  const weight = x => Math.min(3, x.n) * x.w;
  const topUni = [...uni.entries()].sort((a, b) => weight(b[1]) - weight(a[1])).slice(0, 35);
  // Pairs only come from requirement and duty lines, so they read like what the job actually needs.
  const topBi = [...bi.entries()].sort((a, b) => weight(b[1]) - weight(a[1])).slice(0, 20);
  let got = 0, total = 0;
  for (const [s, u] of topUni) { total += weight(u); if (idx.words.has(s)) got += weight(u); }
  const hit = [], near = [], miss = [];
  // "BLS certification" when you list BLS, "Excel skills" when you list Excel: the skill is the phrase.
  const GENERIC = /^(certif|certifi|licens|license|experien|skill|knowled|proficien|system|software|tool|platform|program|training)/;
  for (const [key, b] of topBi) {
    const w = weight(b) * 1.5;
    total += w;
    const skillPart = b.parts.findIndex(p => skillStems.has(p));
    if (idx.pairs.has(key)) { got += w; hit.push(b.shown); }
    else if (skillPart >= 0 && (skillPart === 1 || GENERIC.test(b.parts[1 - skillPart])) && b.parts.some(p => idx.words.has(p))) { got += w; hit.push(b.shown); }
    // Both words are on your resume, just not side by side: half credit, and worth writing the posting's way.
    else if (b.parts.every(p => idx.words.has(p))) { got += w * 0.5; near.push(b.shown); }
    else miss.push(b.shown);
  }
  const share = total ? got / total : 0;
  // A strong, honest match shares roughly half of a posting's key wording; scale so that reads as ~0.9.
  return { score: Math.min(1, share / 0.55), share, hit: hit.slice(0, 12), near: near.slice(0, 12), miss: miss.slice(0, 12), missWords: topUni.filter(([s]) => !idx.words.has(s)).slice(0, 12).map(([, u]) => u.shown) };
}

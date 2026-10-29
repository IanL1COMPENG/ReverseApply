// Career paths for every major, not just engineering: what someone who studies X (or has worked as Y)
// usually applies for, and which job-board categories hold those openings. Used to suggest target roles
// and to pull the right fields from The Muse's all-industry job feed.
export const PATHS = [
  { id: 'software', label: 'Software & IT', major: /computer science|computer engineering|software|informatics|computing|information (technology|systems|science)|\bCSE?\b|\bEECS\b|\bIT\b|cyber/i,
    title: /software|developer|programmer|web|\bit\b|help ?desk|devops|cyber|security analyst/i,
    roles: ['software engineer', 'software developer', 'it support', 'data analyst'], muse: ['Software Engineering', 'Computer and IT', 'Data and Analytics'] },
  { id: 'data', label: 'Data & analytics', major: /data science|statistic|mathematic|applied math|actuarial|analytics|operations research/i,
    title: /data|analyst|analytics|actuar|statistic/i,
    roles: ['data analyst', 'business analyst', 'actuarial analyst', 'financial analyst'], muse: ['Data and Analytics', 'Accounting and Finance', 'Business Operations'] },
  { id: 'engineering', label: 'Engineering', major: /(mechanical|electrical|civil|chemical|aerospace|industrial|biomedical|materials|manufacturing|nuclear|environmental|systems) engineering|\bengineering\b/i,
    title: /engineer|technician|drafter|cad/i,
    roles: ['mechanical engineer', 'electrical engineer', 'civil engineer', 'manufacturing engineer', 'engineering technician'], muse: ['Science and Engineering', 'Manufacturing and Warehouse', 'Construction'] },
  { id: 'accounting', label: 'Accounting & finance', major: /accounting|finance|financial|banking|economics|actuarial|real estate/i,
    title: /account|audit|tax|finance|financial|bookkeep|payroll|credit|bank|teller|loan/i,
    roles: ['accountant', 'financial analyst', 'audit associate', 'staff accountant', 'accounts payable', 'tax associate', 'bookkeeper'], muse: ['Accounting and Finance', 'Business Operations', 'Real Estate'] },
  { id: 'marketing', label: 'Marketing & communications', major: /marketing|advertising|communication|journalism|public relations|media|english|writing|rhetoric|digital media/i,
    title: /marketing|social media|content|brand|communications|copywrit|writer|editor|public relations|\bpr\b|seo|campaign/i,
    roles: ['marketing coordinator', 'marketing specialist', 'marketing associate', 'social media coordinator', 'communications coordinator', 'content writer'], muse: ['Advertising and Marketing', 'Media, PR, and Communications', 'Writing and Editing'] },
  { id: 'business', label: 'Business & operations', major: /business|management|entrepreneur|supply chain|logistics|operations|commerce|\bMBA\b|international business/i,
    title: /operations|business|project|coordinator|administrat|office|manager|logistics|supply chain|purchas|buyer/i,
    roles: ['business analyst', 'operations coordinator', 'project coordinator', 'supply chain analyst', 'management trainee'], muse: ['Business Operations', 'Project Management', 'Management', 'Transportation and Logistics'] },
  { id: 'sales', label: 'Sales & customer success', major: /sales|professional selling/i,
    title: /sales|account executive|account manager|business development|customer success|customer service|representative|\bsdr\b|\bbdr\b/i,
    roles: ['sales representative', 'account executive', 'customer success', 'business development representative'], muse: ['Sales', 'Account Management', 'Customer Service'] },
  { id: 'hr', label: 'Human resources', major: /human resource|organizational|industrial.organizational|labor relations/i,
    title: /human resources|\bhr\b|recruit|talent|people operations|benefits/i,
    roles: ['human resources coordinator', 'recruiter', 'talent acquisition coordinator'], muse: ['Human Resources and Recruitment', 'Business Operations'] },
  { id: 'design', label: 'Design & arts', major: /\bdesign\b|graphic|fine arts?\b|\bart\b|architecture|animation|film|photograph|music|theat|illustration|\bUX\b|human.computer interaction/i,
    title: /design|artist|creative|video|photograph|illustrat|animator|editor/i,
    roles: ['graphic designer', 'ux designer', 'visual designer', 'video editor'], muse: ['Design and UX', 'Arts', 'Advertising and Marketing'] },
  { id: 'nursing', label: 'Nursing & patient care', major: /nursing|\bBSN\b|\bRN\b|nurse/i,
    title: /nurse|\brn\b|\blpn\b|\bcna\b|patient care|clinical/i,
    roles: ['registered nurse', 'nurse', 'patient care technician', 'nursing assistant'], muse: ['Healthcare'] },
  { id: 'health', label: 'Health & life sciences', major: /biology|chemistry|biochem|neuroscience|health|pharmac|kinesiology|exercise science|nutrition|public health|pre-?med|biomedical sciences?|life sciences?|microbiology|physiology/i,
    title: /research assistant|lab|laboratory|scientist|clinical|medical|pharmacy|health|therap|technician|scribe/i,
    roles: ['research assistant', 'laboratory technician', 'clinical research coordinator', 'medical assistant', 'medical scribe'], muse: ['Healthcare', 'Science and Engineering'] },
  { id: 'social', label: 'Psychology & social services', major: /psychology|sociology|social work|human services|counseling|criminology|family studies|anthropology/i,
    title: /case manager|social work|behavior|counsel|youth|community|outreach|advocate|mental health/i,
    roles: ['case manager', 'behavior technician', 'research assistant', 'community outreach coordinator'], muse: ['Social Services', 'Healthcare', 'Education'] },
  { id: 'policy', label: 'Policy, government & law', major: /political science|public policy|history|international (relations|studies)|government|philosophy|legal studies|pre-?law|\blaw\b|criminal justice|paralegal/i,
    title: /policy|legislat|government|paralegal|legal|law clerk|compliance|analyst/i,
    roles: ['paralegal', 'legal assistant', 'policy analyst', 'research assistant', 'compliance analyst'], muse: ['Legal Services', 'Business Operations', 'Writing and Editing'] },
  { id: 'education', label: 'Education', major: /\beducation\b|teaching|early childhood|special education|\bTESOL\b/i,
    title: /teacher|tutor|teaching|instructor|educat|paraprofessional|school|childcare/i,
    roles: ['teacher', 'teaching assistant', 'tutor', 'paraprofessional'], muse: ['Education'] },
  { id: 'hospitality', label: 'Hospitality & retail', major: /hospitality|hotel|tourism|culinary|restaurant|event management|retail/i,
    title: /server|barista|cashier|host|retail|store|sales associate|front desk|guest|hotel|restaurant|crew|shift/i,
    roles: ['guest services', 'event coordinator', 'retail associate', 'restaurant manager'], muse: ['Food and Hospitality Services', 'Retail', 'Customer Service'] },
  { id: 'trades', label: 'Skilled trades & logistics', major: /construction management|automotive|welding|electrician|hvac|aviation|maintenance/i,
    title: /technician|electrician|mechanic|warehouse|driver|forklift|maintenance|installer|hvac|welder|operator/i,
    roles: ['maintenance technician', 'warehouse associate', 'logistics coordinator'], muse: ['Installation, Maintenance, and Repairs', 'Manufacturing and Warehouse', 'Transportation and Logistics'] },
  { id: 'product', label: 'Product management', major: /product management/i,
    title: /product manager|product owner|product analyst/i,
    roles: ['product manager', 'associate product manager', 'product analyst'], muse: ['Product Management', 'Business Operations'] },
];
export const PATH_BY_ID = Object.fromEntries(PATHS.map(p => [p.id, p]));

// Paths that fit this resume: the major first (it is what employers screen on), then recent job titles.
export function pathsFor(parsed) {
  const edu = parsed?.education || {};
  const majorText = `${edu.fieldText || ''} ${edu.major || ''}`;
  const titles = (parsed?.entries || []).filter(e => e.kind === 'job' || e.kind === 'activity').map(e => e.header.split(' · ').slice(0, 2).join(' ')).join(' \n ');
  const scored = PATHS.map(p => ({ p, s: (p.major.test(majorText) ? 3 : 0) + (titles.match(new RegExp(p.title.source, 'gi')) || []).length * 0.6 }))
    .filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  return scored.slice(0, 3).map(x => x.p);
}

// Target roles to suggest: the best path's roles, then a second path's top roles.
export function suggestRoles(parsed) {
  const paths = pathsFor(parsed);
  const out = [];
  paths.forEach((p, i) => out.push(...(i === 0 ? p.roles.slice(0, 3) : p.roles.slice(0, 1))));
  return [...new Set(out)].slice(0, 4);
}

// The paths to search: the resume's own first, then one per target role the user typed
// ("patient care technician" is nursing, not engineering, because nursing lists that role).
export function searchPaths(roles, parsed) {
  const byRole = roles.map(r => r.toLowerCase().trim()).map(r => PATHS.find(p => p.roles.includes(r)) || PATHS.find(p => p.title.test(r)));
  return [...new Set([...pathsFor(parsed), ...byRole.filter(Boolean)])].slice(0, 4);
}

// Muse categories to search for these roles: each path's main category first, then the rest.
export function museCategories(roles, parsed) {
  const paths = searchPaths(roles, parsed);
  const order = [...paths.map(p => p.muse[0]), ...paths.flatMap(p => p.muse.slice(1))];
  return [...new Set(order)].slice(0, 6);
}

// The path a job belongs to, from its title.
export const pathOfTitle = title => PATHS.find(p => p.title.test(title)) || null;

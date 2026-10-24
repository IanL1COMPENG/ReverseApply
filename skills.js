// Keyword dictionary used to match resumes against job postings.
// Each entry: canonical name, plus aliases that count as the same skill.
const RAW = `
python; java; javascript|js; typescript|ts; c++|cpp; c#|csharp; go|golang; rust; ruby; php; swift; kotlin; scala; r; matlab; sql; nosql; bash|shell scripting; perl; dart; elixir; haskell; solidity
react|react.js|reactjs; next.js|nextjs; vue|vue.js; angular; svelte; node.js|nodejs|node; express; django; flask; fastapi; spring|spring boot; rails|ruby on rails; .net|dotnet; laravel; graphql; rest|restful|rest api; grpc; html; css; tailwind; sass; redux; jquery; webpack; vite
react native; flutter; ios; android; swiftui; jetpack compose
aws|amazon web services; gcp|google cloud; azure; docker; kubernetes|k8s; terraform; ansible; ci/cd|cicd; jenkins; github actions; linux; unix; nginx; serverless; lambda; cloudformation; helm; prometheus; grafana; datadog; splunk; elk|elasticsearch; kafka; rabbitmq; redis; memcached
postgresql|postgres; mysql; mongodb; dynamodb; cassandra; snowflake; bigquery; redshift; databricks; spark|pyspark; hadoop; airflow; dbt; etl; data warehouse|data warehousing; data pipeline|data pipelines; data modeling; tableau; power bi|powerbi; looker; excel; google sheets; vba; pandas; numpy; scipy; jupyter
machine learning|ml; deep learning; nlp|natural language processing; computer vision; llm|llms|large language models; generative ai|genai; pytorch; tensorflow; keras; scikit-learn|sklearn; hugging face|huggingface; langchain; rag|retrieval augmented generation; prompt engineering; mlops; xgboost; statistics|statistical analysis; a/b testing|ab testing|experimentation; data analysis|data analytics; data visualization; forecasting; regression
microservices; distributed systems; system design; api design; object-oriented|oop; data structures; algorithms; agile; scrum; kanban; jira; confluence; git; tdd|test-driven development; unit testing; integration testing; selenium; cypress; playwright; jest; pytest; qa|quality assurance; debugging; performance optimization; scalability
security|cybersecurity; penetration testing; siem; soc; iam; oauth; encryption; network security; incident response; compliance; soc 2|soc2; gdpr; hipaa; pci
figma; sketch; adobe xd; photoshop; illustrator; indesign; after effects; premiere pro; ui design|ui; ux design|ux|user experience; user research; wireframing; prototyping; design systems; accessibility|a11y; usability testing
product management; product strategy; roadmap|roadmapping; product roadmap; stakeholder management; requirements gathering; user stories; go-to-market|gtm; okrs; kpis; market research; competitive analysis; pricing
project management; program management; pmp; budgeting; resource planning; risk management; vendor management; operations; process improvement; lean; six sigma; supply chain; logistics; inventory management; procurement
salesforce; hubspot; crm; b2b; b2c; saas; sales; business development; account management; customer success; lead generation; cold calling; negotiation; quota attainment|quota; pipeline management; partnerships
marketing; digital marketing; seo; sem; ppc; google ads; google analytics; content marketing; social media; email marketing; copywriting; brand strategy|branding; growth marketing; marketing automation; campaign management; public relations|pr; communications
financial modeling; financial analysis; accounting; gaap; fp&a; valuation; dcf; bloomberg; investment banking; private equity; equity research; auditing|audit; tax; bookkeeping; quickbooks; reconciliation; payroll; risk analysis; underwriting; trading
recruiting; talent acquisition; onboarding; hris; workday; employee relations; benefits administration; training and development
customer service; customer support; zendesk; troubleshooting; technical support; help desk; ticketing
healthcare; patient care; ehr|emr; epic; clinical research; nursing; pharmacy; medical terminology; cpr; bls
teaching; curriculum development; tutoring; lesson planning; classroom management
leadership; team leadership; mentoring|mentorship; cross-functional|cross functional; communication; presentation|presentations; public speaking; problem solving|problem-solving; collaboration; critical thinking; time management; attention to detail; analytical skills; strategic planning; decision making
autocad; solidworks; cad; revit; matlab simulink|simulink; plc; manufacturing; quality control; mechanical engineering; electrical engineering; embedded systems; firmware; fpga; verilog; vhdl; robotics; iot
spanish; french; mandarin|chinese; german; portuguese; japanese; korean; arabic; hindi; bilingual
`;

export const SKILLS = RAW.split(/[;\n]/).map(s => s.trim()).filter(Boolean).map(entry => {
  const names = entry.split('|').map(s => s.trim().toLowerCase());
  return { name: names[0], aliases: names };
});

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERNS = SKILLS.map(s => ({
  name: s.name,
  // word-ish boundaries that also work for c++, c#, .net, ci/cd
  re: new RegExp(`(^|[^a-z0-9+#])(${s.aliases.map(esc).join('|')})(?![a-z0-9+#])`, 'i'),
}));

// Short or ambiguous names need a stricter, case-sensitive check.
const STRICT = { r: /(^|[\s,(/])R([\s,)/]|$)/, go: /\bGo(lang)?\b(?![- ]to)/, ui: /\bUI\b/, ux: /\bUX\b/, pr: /\bPR\b/, ml: /\bML\b/, ts: /\bTS\b/, js: /\bJS\b/, rest: /\bREST(ful)?\b/, lean: /\bLean\b/, spark: /\bSpark\b/, express: /\bExpress(\.js)?\b/, swift: /\bSwift\b/, rust: /\bRust\b/, dart: /\bDart\b/, epic: /\bEpic\b/, node: /\bNode(\.js)?\b/ };

export function extractSkills(text) {
  if (!text) return [];
  const found = new Set();
  for (const p of PATTERNS) {
    const strict = STRICT[p.name];
    if (strict ? strict.test(text) : p.re.test(text)) found.add(p.name);
  }
  return [...found];
}

// How strongly a posting leans on each skill (mentions count), for prioritising keywords.
export function skillWeights(text) {
  const w = {};
  for (const name of extractSkills(text)) {
    const p = PATTERNS.find(x => x.name === name);
    const g = new RegExp(p.re.source, 'gi');
    w[name] = Math.min(4, (text.match(g) || []).length || 1);
  }
  return w;
}

export const pretty = s => ({ 'aws': 'AWS', 'gcp': 'GCP', 'sql': 'SQL', 'nosql': 'NoSQL', 'html': 'HTML', 'css': 'CSS', 'etl': 'ETL', 'nlp': 'NLP', 'llm': 'LLMs', 'rag': 'RAG', 'seo': 'SEO', 'sem': 'SEM', 'ppc': 'PPC', 'crm': 'CRM', 'b2b': 'B2B', 'b2c': 'B2C', 'saas': 'SaaS', 'gtm': 'GTM', 'kpis': 'KPIs', 'okrs': 'OKRs', 'ui design': 'UI design', 'ux design': 'UX design', 'qa': 'QA', 'iam': 'IAM', 'siem': 'SIEM', 'soc': 'SOC', 'soc 2': 'SOC 2', 'gdpr': 'GDPR', 'hipaa': 'HIPAA', 'pci': 'PCI', 'ci/cd': 'CI/CD', 'tdd': 'TDD', 'oop': 'OOP', 'api design': 'API design', 'rest': 'REST APIs', 'grpc': 'gRPC', 'graphql': 'GraphQL', 'ios': 'iOS', 'mlops': 'MLOps', 'fp&a': 'FP&A', 'gaap': 'GAAP', 'dcf': 'DCF', 'ehr': 'EHR', 'cpr': 'CPR', 'bls': 'BLS', 'cad': 'CAD', 'plc': 'PLC', 'iot': 'IoT', 'fpga': 'FPGA', 'pmp': 'PMP', 'hris': 'HRIS', 'a/b testing': 'A/B testing', 'power bi': 'Power BI', 'c++': 'C++', 'c#': 'C#', '.net': '.NET', 'pr': 'PR', 'machine learning': 'Machine learning', 'pytorch': 'PyTorch', 'tensorflow': 'TensorFlow', 'postgresql': 'PostgreSQL', 'mysql': 'MySQL', 'mongodb': 'MongoDB', 'dynamodb': 'DynamoDB', 'bigquery': 'BigQuery', 'javascript': 'JavaScript', 'typescript': 'TypeScript', 'node.js': 'Node.js', 'next.js': 'Next.js', 'vue': 'Vue', 'github actions': 'GitHub Actions', 'hubspot': 'HubSpot', 'quickbooks': 'QuickBooks', 'linkedin': 'LinkedIn', 'scikit-learn': 'scikit-learn', 'numpy': 'NumPy', 'jupyter': 'Jupyter', 'xgboost': 'XGBoost', 'autocad': 'AutoCAD', 'solidworks': 'SolidWorks', 'figma': 'Figma' }[s] || s.replace(/\b[a-z]/g, c => c.toUpperCase()));

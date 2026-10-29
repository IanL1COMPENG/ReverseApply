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
c; objective-c; ocaml; lua; assembly language|x86 assembly|arm assembly; cuda; opencv; ros; labview; systemverilog; vivado; quartus; asic; rtos; microcontrollers|microcontroller; embedded c; i2c; uart; can bus; pcb design|pcb layout|pcb; altium; kicad; oscilloscope|oscilloscopes; circuit design; analog design; digital design; soldering
operating systems; computer networks|networking protocols|tcp/ip; concurrency|multithreading|multi-threading; compilers; computer architecture; databases|database design|relational databases; web development; full stack|full-stack; frontend|front-end development|front end development; backend|back-end development|back end development; mobile development|mobile app development; api|apis; json; cloud computing; unity; unreal engine|unreal; opengl; vulkan; three.js|threejs; d3|d3.js
matplotlib; seaborn; stata; sas; spss; alteryx; sharepoint; power automate; servicenow; sap; erp; gis|arcgis|qgis; canva; wordpress; webflow
reinforcement learning; fine-tuning|fine tuning; vector databases|vector database; llamaindex; openai api; probability; linear algebra; calculus; econometrics; time series; optimization; stochastic calculus
fea|finite element analysis; ansys; cfd|computational fluid dynamics; gd&t; 3d printing|additive manufacturing; cnc; creo; catia; fusion 360
accounts payable; accounts receivable; general ledger; journal entries; month-end close|month end close; financial reporting; financial statements; variance analysis; cost accounting; tax preparation|tax returns; cpa; netsuite; sage intacct; adp; billing; invoicing; collections; cash handling; banking
hootsuite; sprout social; mailchimp; meta ads|facebook ads; content creation|content creator; event planning|event coordination|event management; brand management; influencer marketing; adobe creative suite|adobe creative cloud; copy editing|copyediting|proofreading; ap style; press releases; media relations; public speaking; marketing campaigns; graphic design; video editing; photography; final cut pro; davinci resolve; lightroom; typography
prospecting; upselling|cross-selling; retail sales; point of sale|pos system|pos systems; merchandising; visual merchandising; inventory|inventory control; store operations; client relations|customer relations; customer experience; call center
vital signs; phlebotomy; patient intake; medication administration; rn|registered nurse; lpn|licensed practical nurse; cna|certified nursing assistant; acls; pals; first aid; infection control; patient education; triage; telehealth; medical billing; medical coding|icd-10; clinical documentation; patient scheduling; caregiving; home health
pcr; cell culture; western blot; microscopy; gel electrophoresis; aseptic technique; elisa; lab safety|laboratory safety; laboratory techniques|lab techniques; data collection; literature review; irb; scientific writing; research
iep|individualized education program|ieps; special education; differentiated instruction; esl|english as a second language|ell; early childhood education; childcare|child care; behavior management; aba|applied behavior analysis; classroom instruction; student engagement
interviewing; employee engagement; hr policies; applicant tracking system|applicant tracking systems; sourcing candidates|candidate sourcing; employee onboarding
legal research; westlaw; lexisnexis; contract review|contract drafting; legal writing; e-discovery|ediscovery; litigation; notary; case management
crisis intervention; community outreach; motivational interviewing; trauma-informed care|trauma informed care; de-escalation; social services; mental health; substance abuse; volunteer management; fundraising|grant writing
food safety; servsafe; guest services|guest relations; front desk; reservations; bartending; food preparation|food prep; hospitality
forklift; osha; preventive maintenance; blueprint reading|blueprints; hvac; shipping and receiving|shipping & receiving; warehouse operations; cdl|commercial driver's license; power tools; electrical wiring
microsoft office|ms office|microsoft 365|office 365; microsoft word|ms word; powerpoint|microsoft powerpoint; outlook|microsoft outlook; data entry; scheduling|calendar management; travel coordination; office administration|administrative support; filing|record keeping|recordkeeping; typing
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
const STRICT = { r: /(^|[\s,(/])R([\s,)/]|$)/, go: /\bGo(lang)?\b(?![- ]to)/, ui: /\bUI\b/, ux: /\bUX\b/, pr: /\bPR\b/, ml: /\bML\b/, ts: /\bTS\b/, js: /\bJS\b/, rest: /\bREST(ful)?\b/, lean: /\bLean\b/, spark: /\bSpark\b/, express: /\bExpress(\.js)?\b/, swift: /\bSwift\b/, rust: /\bRust\b/, dart: /\bDart\b/, epic: /\bEpic\b/, node: /\bNode(\.js)?\b/,
  // "C" only as a language in a list ("C, C++", "C/C++", "Python or C"), never "Section C" or "C-suite".
  // Credentials and acronyms count only in capitals: "rn" inside "return" or "aba" inside "abacus" never match.
  rn: /\bRNs?\b|registered nurse/i, lpn: /\bLPN\b|licensed practical nurse/i, cna: /\bCNA\b|certified nursing assistant/i, cpa: /\bCPA\b/, adp: /\bADP\b/,
  acls: /\bACLS\b/, pals: /\bPALS\b/, pcr: /\bq?PCR\b/, elisa: /\bELISA\b/, irb: /\bIRB\b/, iep: /\bIEPs?\b|individualized education program/i,
  esl: /\bESL\b|\bELLs?\b|english as a second language/i, aba: /\bABA\b|applied behavior analysis/i, cdl: /\bCDL\b|commercial driver'?s license/i,
  osha: /\bOSHA\b/, outlook: /\b(?:Microsoft |MS )?Outlook\b/, filing: /\bfiling\b(?! (?:taxes|a claim|for))|record ?keeping/i, typing: /\btyping (?:speed|skills|\d+)|\d+\s*wpm\b/i,
  research: /\bresearch (?:experience|skills|methods|projects?|assistant)\b/i, inventory: /\binventory (?:control|management|counts?|tracking)\b|\binventory\b/i,
  'point of sale': /\bpoint[- ]of[- ]sale\b|\bPOS (?:system|systems|software)\b/i, billing: /\bbilling\b/i, banking: /\bbanking\b/i,
  c: /(?:^|[\s(,/])C(?=\s*(?:[,/)]|\s(?:or|and)\s|\+\+|\s*$))(?!\+\+)|\bC (?:programming|language)\b|\bin C\b(?![+#-])/, ros: /\bROS2?\b/, sas: /\bSAS\b/, sap: /\bSAP\b/, erp: /\bERP\b/, unity: /\bUnity(?: 3D| engine)?\b(?! of)/, d3: /\bD3(\.js)?\b/, api: /\bAPIs?\b/, json: /\bJSON\b/, asic: /\bASICs?\b/, uart: /\bUART\b/, rtos: /\bRTOS\b/, cnc: /\bCNC\b/, fea: /\bFEA\b|finite element analysis/i, cfd: /\bCFD\b|computational fluid dynamics/i, pcb: /\bPCBs?\b|PCB (?:design|layout)/, gis: /\bGIS\b|ArcGIS|QGIS/, lua: /\bLua\b/, optimization: /\boptimization\b(?! of (?:our|the|your) (?:website|process|workflow))/i, probability: /\bprobability\b/i, assembly: /assembly language|x86 assembly|ARM assembly/i,
  // "Spring 2026" is a semester, not the Java framework.
  spring: /\bSpring[\s-]?(Boot|Framework|MVC|Cloud|Security|Data|Batch)\b|\bSpring\b(?=[^\n]{0,40}\b(Java|Kotlin|Hibernate|microservices?)\b)/ };

export function extractSkills(text) {
  if (!text) return [];
  const found = new Set();
  for (const p of PATTERNS) {
    const strict = STRICT[p.name];
    if (strict ? strict.test(text) : p.re.test(text)) found.add(p.name);
  }
  return [...found];
}

// The skill exactly as the posting writes it ("MS Excel", "Microsoft Office 365"), so the tailored resume
// uses the employer's own words, which is what keyword screens compare. Falls back to the standard name.
export function spellingIn(name, text) {
  const p = PATTERNS.find(x => x.name === name);
  if (!p || !text) return null;
  const strict = STRICT[name];
  const m = strict ? text.match(new RegExp(strict.source, strict.flags.replace('g', ''))) : text.match(p.re);
  const hit = m && (strict ? m[0] : m[2]);
  // Keep short or all-lowercase hits in their proper form ("aws" -> "AWS").
  return hit && hit.trim().length > 2 && hit !== hit.toLowerCase() ? hit.trim() : null;
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

export const pretty = s => ({ 'aws': 'AWS', 'gcp': 'GCP', 'sql': 'SQL', 'nosql': 'NoSQL', 'html': 'HTML', 'css': 'CSS', 'etl': 'ETL', 'nlp': 'NLP', 'llm': 'LLMs', 'rag': 'RAG', 'seo': 'SEO', 'sem': 'SEM', 'ppc': 'PPC', 'crm': 'CRM', 'b2b': 'B2B', 'b2c': 'B2C', 'saas': 'SaaS', 'gtm': 'GTM', 'kpis': 'KPIs', 'okrs': 'OKRs', 'ui design': 'UI design', 'ux design': 'UX design', 'qa': 'QA', 'iam': 'IAM', 'siem': 'SIEM', 'soc': 'SOC', 'soc 2': 'SOC 2', 'gdpr': 'GDPR', 'hipaa': 'HIPAA', 'pci': 'PCI', 'ci/cd': 'CI/CD', 'tdd': 'TDD', 'oop': 'OOP', 'api design': 'API design', 'rest': 'REST APIs', 'grpc': 'gRPC', 'graphql': 'GraphQL', 'ios': 'iOS', 'mlops': 'MLOps', 'fp&a': 'FP&A', 'gaap': 'GAAP', 'dcf': 'DCF', 'ehr': 'EHR', 'cpr': 'CPR', 'bls': 'BLS', 'cad': 'CAD', 'plc': 'PLC', 'iot': 'IoT', 'fpga': 'FPGA', 'pmp': 'PMP', 'hris': 'HRIS', 'a/b testing': 'A/B testing', 'power bi': 'Power BI', 'c++': 'C++', 'c#': 'C#', '.net': '.NET', 'pr': 'PR', 'machine learning': 'Machine learning', 'pytorch': 'PyTorch', 'tensorflow': 'TensorFlow', 'postgresql': 'PostgreSQL', 'mysql': 'MySQL', 'mongodb': 'MongoDB', 'dynamodb': 'DynamoDB', 'bigquery': 'BigQuery', 'javascript': 'JavaScript', 'typescript': 'TypeScript', 'node.js': 'Node.js', 'next.js': 'Next.js', 'vue': 'Vue', 'github actions': 'GitHub Actions', 'hubspot': 'HubSpot', 'quickbooks': 'QuickBooks', 'linkedin': 'LinkedIn', 'scikit-learn': 'scikit-learn', 'numpy': 'NumPy', 'jupyter': 'Jupyter', 'xgboost': 'XGBoost', 'autocad': 'AutoCAD', 'solidworks': 'SolidWorks', 'figma': 'Figma', 'c': 'C', 'cuda': 'CUDA', 'opencv': 'OpenCV', 'ros': 'ROS', 'labview': 'LabVIEW', 'systemverilog': 'SystemVerilog', 'asic': 'ASIC', 'rtos': 'RTOS', 'i2c': 'I2C', 'uart': 'UART', 'can bus': 'CAN bus', 'pcb design': 'PCB design', 'api': 'APIs', 'json': 'JSON', 'opengl': 'OpenGL', 'three.js': 'Three.js', 'd3': 'D3.js', 'sas': 'SAS', 'spss': 'SPSS', 'sap': 'SAP', 'erp': 'ERP', 'gis': 'GIS', 'fea': 'FEA', 'cfd': 'CFD', 'gd&t': 'GD&T', 'cnc': 'CNC', 'ocaml': 'OCaml', 'objective-c': 'Objective-C', 'openai api': 'OpenAI API', 'llamaindex': 'LlamaIndex', 'computer networks': 'Computer networks', 'wordpress': 'WordPress', 'servicenow': 'ServiceNow', 'sharepoint': 'SharePoint', 'cpa': 'CPA', 'netsuite': 'NetSuite', 'adp': 'ADP', 'rn': 'RN', 'lpn': 'LPN', 'cna': 'CNA', 'acls': 'ACLS', 'pals': 'PALS', 'pcr': 'PCR', 'elisa': 'ELISA', 'irb': 'IRB', 'iep': 'IEPs', 'esl': 'ESL', 'aba': 'ABA', 'cdl': 'CDL', 'osha': 'OSHA', 'hvac': 'HVAC', 'servsafe': 'ServSafe', 'westlaw': 'Westlaw', 'lexisnexis': 'LexisNexis', 'meta ads': 'Meta Ads', 'microsoft office': 'Microsoft Office', 'microsoft word': 'Microsoft Word', 'powerpoint': 'PowerPoint', 'outlook': 'Outlook', 'ap style': 'AP Style', 'icd-10': 'ICD-10', 'medical coding': 'Medical coding (ICD-10)', 'e-discovery': 'eDiscovery', 'point of sale': 'POS systems', 'adobe creative suite': 'Adobe Creative Suite', 'sprout social': 'Sprout Social', 'mailchimp': 'Mailchimp', 'hootsuite': 'Hootsuite', 'final cut pro': 'Final Cut Pro', 'davinci resolve': 'DaVinci Resolve', 'lightroom': 'Lightroom' }[s] || s.replace(/\b[a-z]/g, c => c.toUpperCase()));

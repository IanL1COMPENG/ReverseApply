// How hard each employer is to get into, estimated from general reputation, applicant
// demand and hiring bars. These are estimates, not published acceptance rates.
// 1 = extremely competitive, 2 = very competitive, 3 = competitive. Unlisted = typical (4).
const TIERS = {
  1: `Google, Alphabet, YouTube, Meta, Facebook, Instagram, WhatsApp, Apple, Netflix, Microsoft, Microsoft Research, Amazon,
      Amazon Web Services, AWS, TikTok, ByteDance, Lark, CapCut, OpenAI, Anthropic, DeepMind, Google DeepMind, Thinking Machines,
      Safe Superintelligence, Jane Street, Citadel, Citadel Securities, Two Sigma, Hudson River Trading, HRT, D. E. Shaw, DE Shaw,
      Renaissance Technologies, Jump Trading, Optiver, IMC, IMC Trading, SIG, Susquehanna, Susquehanna International Group,
      Five Rings, XTX Markets, Radix Trading, Headlands Technologies, PDT Partners, G-Research, Tower Research, Tower Research Capital,
      DRW, Akuna Capital, Stripe, SpaceX, NVIDIA, xAI, Figma, Waymo, Anduril, Ramp, Palantir, Palantir Technologies, Perplexity,
      Cursor, Anysphere, Linear, Sierra, McKinsey, McKinsey & Company, Bain, Bain & Company, Boston Consulting Group, BCG,
      Goldman Sachs, Blackstone, KKR, Centerview Partners, PJT Partners, Valve, Scale AI`,
  2: `LinkedIn, GitHub, Uber, Airbnb, Tesla, Databricks, Coinbase, Robinhood, Roblox, Discord, Notion, Plaid, Snowflake, Pinterest,
      Reddit, Snap, Snapchat, DoorDash, Cloudflare, Datadog, Salesforce, Adobe, AMD, Bloomberg, Nuro, Rippling, Brex, Mercury,
      Vercel, Supabase, PostHog, Replit, Cohere, Mistral, ElevenLabs, Harvey, Glean, Wiz, Duolingo, Spotify, Twitch, Epic Games,
      Riot Games, Nintendo, Blizzard, Morgan Stanley, JPMorgan, J.P. Morgan, JPMorgan Chase, Evercore, Lazard, Moelis,
      Point72, Millennium, Millennium Management, Balyasny, Schonfeld, Squarepoint, Squarepoint Capital, Bridgewater,
      Bridgewater Associates, AQR, Arrowstreet, Man Group, Virtu, Virtu Financial, Old Mission, Wolverine Trading,
      Chicago Trading Company, Graviton, Apollo, Carlyle, Bain Capital, BlackRock, Capital One, Applied Intuition, Shield AI,
      Saronic, Skydio, Runway, Hex, Retool, Vanta, Modal, Baseten, Together AI, Fireworks AI, Character AI, Mercor, Hebbia,
      Decagon, Clay, Attio, Lovable, Synthesia, Black Forest Labs, Isomorphic Labs, Stability AI, Lyft, Dropbox, Instacart,
      Shopify, Atlassian, Block, Square, Cash App, Canva, Palo Alto Networks, CrowdStrike, Arista Networks, Blue Origin, NASA,
      Jet Propulsion Laboratory, JPL, Disney, Walt Disney, Pixar, Nike, Procter & Gamble, P&G, Zoox, Affirm, Samsara, Verkada,
      Jane Street Capital, Optiver US, Qualtrics, Intuitive Surgical, Neuralink, Boston Dynamics, Physical Intelligence, Figure AI,
      Hugging Face, Mistral AI, Cognition, Suno, Midjourney, Whoop, Oura, Strava`,
  3: `MongoDB, Twilio, Oracle, IBM, Intel, Qualcomm, Cisco, Electronic Arts, EA, Activision, Deloitte, PwC, EY, Ernst & Young, KPMG,
      Accenture, Booz Allen Hamilton, Booz Allen, Zillow, Intuit, ServiceNow, Workday, VMware, Broadcom, Dell, HP, HP Inc,
      Hewlett Packard Enterprise, HPE, Samsung, Sony, Visa, Mastercard, American Express, PayPal, Chime, SoFi, Kraken, Circle,
      GitLab, HubSpot, Okta, Elastic, Asana, Toast, Grammarly, Carta, Airtable, Intercom, Squarespace, Gusto, Zscaler, Fortinet,
      Peloton, Etsy, Wayfair, eBay, Expedia, Booking.com, Coursera, Khan Academy, Mozilla, Boeing, Lockheed Martin,
      Northrop Grumman, Raytheon, RTX, General Dynamics, L3Harris, BAE Systems, Leidos, SAIC, General Motors, GM, Ford,
      Toyota, Honda, Rivian, Lucid Motors, Cruise, Aurora, Bank of America, Citi, Citigroup, Wells Fargo, Barclays,
      Deutsche Bank, UBS, HSBC, BNP Paribas, Jefferies, RBC, Fidelity, Fidelity Investments, Vanguard, Charles Schwab, Schwab,
      State Street, Northern Trust, T. Rowe Price, Temporal, Sentry, Grafana Labs, Confluent, HashiCorp, Fivetran, LaunchDarkly,
      Netlify, Fastly, PagerDuty, New Relic, Splunk, Pure Storage, Nutanix, SentinelOne, 1Password, Calendly, John Deere,
      Texas Instruments, ASML, Micron, Micron Technology, Applied Materials, KLA, Lam Research, Marvell, Marvell Technology,
      Analog Devices, Cadence, Cadence Design Systems, Synopsys, Western Digital, Seagate, Astera Labs, Cerebras, SambaNova,
      Groq, Etched, Unity, Warner Bros. Discovery, NBCUniversal, ESPN, Paramount, Starbucks, Coca-Cola, PepsiCo, Unilever,
      L'Oréal, Johnson & Johnson, Pfizer, Moderna, Genentech, Medtronic, Abbott, GE, GE Aerospace, GE Vernova, Siemens,
      Honeywell, Caterpillar, 3M, Lowe's, Home Depot, Target, Walmart, Costco, Best Buy, Chewy, Uber Freight, Relativity Space,
      Rocket Lab, Astranis, Hermeus, Lawrence Livermore National Laboratory, LLNL, Sandia, Sandia National Laboratories,
      Los Alamos National Laboratory, MIT Lincoln Laboratory, Johns Hopkins APL, Belvedere Trading, Peak6, Walleye Capital,
      DV Trading, Hyannis Port Research, Gemini, OKX, Binance, Figure Technologies, Mastercard, Philips, Bosch, Garmin, Zebra,
      Motorola Solutions, Ciena, Juniper Networks, Red Hat, SAP, Autodesk, Electronic Arts, Take-Two, Ubisoft, Bungie, Niantic`,
};

export const norm = s => (s || '').toLowerCase().replace(/&/g, 'and').replace(/\b(inc|llc|ltd|corp|corporation|co|company|technologies|labs?|the)\b/g, '').replace(/[^a-z0-9]/g, '');

const TIER_OF = new Map();
const NAMES = [];
for (const [tier, list] of Object.entries(TIERS).reverse()) {
  for (const raw of list.split(',')) {
    const name = raw.trim();
    if (!name) continue;
    TIER_OF.set(norm(name), +tier);
    NAMES.push([name, +tier]);
  }
}

export const TIER_LABEL = { 1: 'Extremely competitive', 2: 'Very competitive', 3: 'Competitive', 4: 'Typical competition' };

// Longest names first, so "TikTok USDS" or "Amazon Web Services (AWS)" finds its parent brand.
// Everyday words ("Block", "Intel", "Apple") would also prefix unrelated names (BlockFi, Intelligent Systems, Applebee's).
const NO_PREFIX = new Set(['block', 'square', 'linear', 'mercury', 'notion', 'sierra', 'circle', 'gemini', 'unity', 'cursor', 'modal', 'runway', 'target', 'apple', 'chime', 'toast', 'carta', 'canva', 'intel', 'cognition', 'whoop', 'affirm', 'figure', 'valve', 'oracle', 'samsara', 'kraken', 'nasa', 'disney', 'micron', 'honda', 'bosch', 'zebra', 'philips', 'ciena', 'strava']);
const PREFIXES = [...TIER_OF.keys()].filter(k => k.length >= 5 && !NO_PREFIX.has(k)).sort((a, b) => b.length - a.length);

// Big public boards (hundreds of openings) belong to large, well-known employers: at least "competitive".
// Tech, quant and product internships draw hundreds of applicants per seat even at lesser-known companies.
export function companyTier(name, boardSize = 0, { intern = false, title = '' } = {}) {
  const n = norm(name);
  const t = TIER_OF.get(n) || TIER_OF.get(PREFIXES.find(k => n.startsWith(k)));
  if (t) return t;
  // A big board usually means a well-known employer, except for high-volume hiring (nursing, retail, hotels,
  // care work), where hundreds of openings mean they need people and odds are better, not worse.
  const volume = /\b(nurse|rn|lpn|cna|caregiver|aide|therapist|technician|associate|cashier|attendant|server|cook|driver|warehouse|sales advisor|crew|housekeep|concierge|room|teacher|tutor|coach|care)\b/i.test(title);
  if (boardSize > 300 && !volume) return 3;
  if (intern && /software|engineer|developer|data|machine learning|\bml\b|\bai\b|quant|trading|product manag|research|design/i.test(title)) return 3;
  return 4;
}

// Brand-name employers already on a resume (header lines only, to avoid matching common words).
const AMBIGUOUS = new Set(['block', 'square', 'linear', 'ramp', 'mercury', 'notion', 'clay', 'hex', 'modal', 'runway', 'sierra', 'remote', 'figma', 'ea', 'ey', 'ibm', 'imc', 'sig', 'drw', 'citi', 'hp', 'visa', 'toast', 'oscar', 'apple', 'meta', 'chime', 'elastic', 'temporal', 'sentry', 'decagon', 'harvey', 'together ai', 'cognition', 'circle', 'gemini', 'unity', 'target', 'cursor', 'snap', 'gm', 'ge', 'aws', 'hrt', 'jpl', 'p&g', 'rtx', 'hpe', 'sap', 'gap', 'whoop', 'oura', 'suno', 'figure', 'nike', 'nasa', 'abbott', 'peak6', 'lark', 'okx']);
export function brandEmployers(headerLines) {
  const text = headerLines.join('\n');
  const found = new Map();
  for (const [name, tier] of NAMES) {
    if (name.length < 3) continue;
    const re = new RegExp(`(^|[^A-Za-z])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`, AMBIGUOUS.has(name.toLowerCase()) ? '' : 'i');
    if (re.test(text) && (!found.has(name) || found.get(name) > tier)) found.set(name, tier);
  }
  return [...found].map(([name, tier]) => ({ name, tier })).sort((a, b) => a.tier - b.tier);
}

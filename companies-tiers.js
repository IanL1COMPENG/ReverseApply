// How hard each employer is to get into, estimated from general reputation, applicant
// demand and hiring bars. These are estimates, not published acceptance rates.
// 1 = extremely competitive, 2 = very competitive, 3 = competitive. Unlisted = typical (4).
const TIERS = {
  1: `Google, Alphabet, Meta, Facebook, Apple, Netflix, OpenAI, Anthropic, DeepMind, Google DeepMind, Jane Street, Citadel,
      Citadel Securities, Two Sigma, Hudson River Trading, D. E. Shaw, DE Shaw, Renaissance Technologies, Jump Trading, Optiver,
      IMC, SIG, Susquehanna, Stripe, SpaceX, NVIDIA, xAI, Figma, Waymo, Anduril, Ramp, Perplexity, Cursor, Anysphere, Linear,
      Sierra, McKinsey, Bain, Boston Consulting Group, BCG, Goldman Sachs, Blackstone, Valve, Tower Research, DRW, Akuna Capital`,
  2: `Microsoft, Amazon, LinkedIn, Uber, Airbnb, Tesla, Palantir, Databricks, Coinbase, Robinhood, Scale AI, Roblox, Discord,
      Notion, Plaid, Snowflake, Pinterest, Reddit, DoorDash, Cloudflare, Datadog, Salesforce, Adobe, AMD, Bloomberg, Nuro,
      Rippling, Brex, Mercury, Vercel, Supabase, PostHog, Replit, Cohere, Mistral, ElevenLabs, Harvey, Glean, Wiz, Duolingo,
      Spotify, Twitch, Epic Games, Riot Games, Morgan Stanley, JPMorgan, J.P. Morgan, JPMorgan Chase, Evercore, Lazard,
      Point72, Millennium, Applied Intuition, Shield AI, Runway, Hex, Retool, Vanta, Modal, Baseten, Together AI, Fireworks AI,
      Character AI, Mercor, Hebbia, Decagon, Clay, Attio, Lovable, Synthesia, Black Forest Labs, Isomorphic Labs, Stability AI`,
  3: `Lyft, Dropbox, Instacart, MongoDB, Twilio, Oracle, IBM, Intel, Qualcomm, Cisco, Capital One, Verkada, CrowdStrike,
      Blizzard, Electronic Arts, EA, Deloitte, PwC, EY, Ernst & Young, KPMG, Shopify, Atlassian, Block, Square, Cash App,
      Zillow, Intuit, ServiceNow, Workday, VMware, Dell, HP, Samsung, Sony, Visa, Mastercard, American Express, PayPal,
      Affirm, Chime, SoFi, GitLab, HubSpot, Okta, Elastic, Asana, Samsara, Toast, Grammarly, Carta, Airtable, Intercom,
      Squarespace, Gusto, Zscaler, Peloton, Etsy, Wayfair, Coursera, Khan Academy, Mozilla, Boeing, Lockheed Martin,
      Northrop Grumman, Raytheon, General Motors, Ford, Rivian, Lucid Motors, Zoox, Cruise, Aurora, Bank of America,
      Citi, Citigroup, Wells Fargo, Barclays, Deutsche Bank, UBS, BlackRock, Fidelity, Vanguard, Accenture, Booz Allen Hamilton,
      Temporal, Sentry, Grafana Labs, Confluent, HashiCorp, Fivetran, LaunchDarkly, Netlify, Fastly, PagerDuty,
      New Relic, Pure Storage, Nutanix, SentinelOne, 1Password, Calendly, John Deere, Texas Instruments, ASML`,
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

// Big public boards (hundreds of openings) belong to large, well-known employers: at least "competitive".
export function companyTier(name, boardSize = 0) {
  const t = TIER_OF.get(norm(name));
  if (t) return t;
  return boardSize > 600 ? 3 : 4;
}

// Brand-name employers already on a resume (header lines only, to avoid matching common words).
const AMBIGUOUS = new Set(['block', 'square', 'linear', 'ramp', 'mercury', 'notion', 'clay', 'hex', 'modal', 'runway', 'sierra', 'remote', 'figma', 'ea', 'ey', 'ibm', 'imc', 'sig', 'drw', 'citi', 'hp', 'visa', 'toast', 'oscar', 'apple', 'meta', 'chime', 'elastic', 'temporal', 'sentry', 'decagon', 'harvey', 'together ai']);
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

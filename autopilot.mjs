// ReverseApply Autopilot: opens each application from your pack, fills your details,
// uploads the tailored resume PDF, and (with --submit) presses Submit when nothing else is needed.
//   npm start                      fill each form, you review and submit
//   npm start -- --submit          also submit forms with no extra required questions or CAPTCHA
//   npm start -- --pack other.json use a different pack file
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import readline from 'node:readline/promises';

const args = process.argv.slice(2);
const AUTO_SUBMIT = args.includes('--submit');
const packPath = resolve(args.includes('--pack') ? args[args.indexOf('--pack') + 1] : 'reverseapply-pack.json');
if (!existsSync(packPath)) {
  console.error(`No pack found at ${packPath}.\nOn the ReverseApply site, queue jobs in step 4 and click "Export Autopilot pack", then put the file here.`);
  process.exit(1);
}
const pack = JSON.parse(readFileSync(packPath, 'utf8'));
const p = pack.profile || {};
const [first, ...rest] = (p.name || '').split(' ');
const last = rest.join(' ');
mkdirSync('out', { recursive: true });
const LOG = 'applied-log.csv';
if (!existsSync(LOG)) writeFileSync(LOG, 'date,company,title,score,result,url\n');
const log = (job, result) => appendFileSync(LOG, [new Date().toISOString(), job.company, job.title, job.score, result, job.applyUrl].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',') + '\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
// A persistent profile keeps you signed in to job sites between runs.
const ctx = await chromium.launchPersistentContext('.browser-profile', { headless: false, viewport: null });
const page = ctx.pages()[0] || await ctx.newPage();

async function fill(selectors, value) {
  if (!value) return false;
  for (const sel of [].concat(selectors)) {
    const el = page.locator(sel).first();
    if (await el.count() && await el.isVisible().catch(() => false) && !(await el.inputValue().catch(() => 'x'))) {
      await el.fill(value).catch(() => {});
      return true;
    }
  }
  return false;
}
async function fillByLabel(re, value) {
  if (!value) return;
  const el = page.getByLabel(re).first();
  if (await el.count() && !(await el.inputValue().catch(() => 'x'))) await el.fill(value).catch(() => {});
}
async function upload(selectors, file) {
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.count()) { await el.setInputFiles(file).catch(() => {}); return true; }
  }
  return false;
}

async function fillForm(job, pdf) {
  if (job.ats === 'greenhouse') {
    await fill('#first_name', first); await fill('#last_name', last); await fill('#email', p.email); await fill('#phone', p.phone);
    await upload(['input#resume', 'input[type=file][id*=resume]', 'input[type=file]'], pdf);
    await fill(['textarea#cover_letter_text', 'textarea[id*=cover]'], job.coverLetter);
  } else if (job.ats === 'lever') {
    await upload(['input[name="resume"]', 'input[type=file]'], pdf);
    await page.waitForTimeout(2500); // Lever parses the resume and may prefill fields
    await fill('input[name="name"]', p.name); await fill('input[name="email"]', p.email); await fill('input[name="phone"]', p.phone);
    await fill('input[name="location"]', p.location);
    await fill('input[name="urls[LinkedIn]"]', p.linkedin); await fill(['input[name="urls[GitHub]"]', 'input[name="urls[Portfolio]"]', 'input[name="urls[Other]"]'], p.site);
    await fill('textarea[name="comments"]', job.coverLetter);
  } else if (job.ats === 'ashby') {
    await fill('input[name="_systemfield_name"]', p.name); await fill('input[name="_systemfield_email"]', p.email);
    await upload(['input[type=file][name*=resume]', 'input[type=file]'], pdf);
  }
  // Generic pass for anything the ATS-specific selectors missed.
  await fillByLabel(/^first name/i, first); await fillByLabel(/^last name/i, last);
  await fillByLabel(/^(full )?name\b/i, p.name); await fillByLabel(/e-?mail/i, p.email); await fillByLabel(/phone/i, p.phone);
  await fillByLabel(/linkedin/i, p.linkedin); await fillByLabel(/github|website|portfolio/i, p.site);
  await fillByLabel(/^(current )?location|city/i, p.location);
}

async function blockers() {
  const captcha = await page.locator('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"]').count();
  const emptyRequired = await page.$$eval('input[required], textarea[required], select[required], [aria-required="true"]',
    els => els.filter(e => e.offsetParent && e.type !== 'hidden' && e.type !== 'file' && !e.value).length).catch(() => 0);
  return { captcha, emptyRequired };
}

console.log(`\nReverseApply Autopilot · ${pack.jobs.length} applications · mode: ${AUTO_SUBMIT ? 'fill + auto-submit when clear' : 'fill, you submit'}\n`);
for (const [i, job] of pack.jobs.entries()) {
  const pdf = resolve('out', job.resumeFile);
  writeFileSync(pdf, Buffer.from(job.resumePdfBase64, 'base64'));
  console.log(`[${i + 1}/${pack.jobs.length}] ${job.score}/5  ${job.title} @ ${job.company}`);
  try {
    await page.goto(job.applyUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    // Some boards show the posting first; click through to the form.
    const applyBtn = page.getByRole('button', { name: /^apply( for this job| now)?$/i }).or(page.getByRole('link', { name: /^apply( for this job| now)?$/i })).first();
    if (await applyBtn.count() && await applyBtn.isVisible().catch(() => false)) { await applyBtn.click().catch(() => {}); await page.waitForTimeout(2000); }
    await fillForm(job, pdf);
    const b = await blockers();
    if (AUTO_SUBMIT && !b.captcha && !b.emptyRequired) {
      const submit = page.getByRole('button', { name: /submit( application)?|send application|apply/i }).last();
      await submit.click();
      await page.waitForTimeout(5000);
      console.log('   ✓ submitted');
      log(job, 'submitted');
      continue;
    }
    const why = [b.captcha && 'CAPTCHA', b.emptyRequired && `${b.emptyRequired} required question(s) left`].filter(Boolean).join(', ');
    console.log(`   Filled.${why ? ` Needs you: ${why}.` : ''} Review the browser, submit it, then press Enter here (s + Enter to skip).`);
    const a = (await rl.question('   > ')).trim().toLowerCase();
    log(job, a === 's' ? 'skipped' : 'submitted by you');
  } catch (e) {
    console.log(`   ✗ ${e.message.split('\n')[0]}`);
    log(job, 'error');
  }
}
console.log(`\nDone. Results saved to ${LOG}.`);
rl.close();
await ctx.close();

# ReverseApply

**Stop applying to jobs. Let the jobs come to you.**

ReverseApply is a free website that turns one resume into a stack of tailored, ready-to-send applications.

1. **Upload your resume** (PDF, DOCX or text). It's read in your browser and never leaves it.
2. **Search at the source.** ReverseApply queries ~200 employers' own hiring systems (Greenhouse, Lever, Ashby) plus remote job feeds in parallel, so you see postings as soon as companies publish them. Paste any company's board link to add it.
3. **Every job is scored 1–5** on title, skills, seniority, freshness, visa and clearance requirements, with the reasons. 5/5 = apply now; below 4 = we tell you to skip.
4. **Tailored resume per job.** Your resume is reordered around the keywords each posting asks for, you tick any missing keywords you genuinely have, and it's exported as a clean, ATS-friendly PDF, with application answers and a cover letter.
5. **🎓 College internships tab.** Internships, co-ops and student programs are split out from full-time jobs into their own tab, pulled from company job boards plus the student-run [SimplifyJobs](https://github.com/SimplifyJobs/Summer2027-Internships) lists. They're scored on *student fit*: your graduation year vs. the class they want, undergrad vs. master's/PhD-only roles, GPA minimums, field and skills. Tailored resumes for internships put Education first and lead with your school and class year.
6. **Autopilot** fills the applications for you from an exported pack (see below).

Optional **AI boost** with your own Anthropic API key: the 7-reviewer resume panel (screening bot, recruiter, hiring manager, teammate, CEO, competing applicant, HR) that tries to reject your resume and then rebuilds it, plus per-job AI rewrites, fit scores and cover letters.

## Use it

Live site: **https://ianl1compeng.github.io/ReverseApply/**

No account, no server, no build step. It's static HTML/JS hosted on GitHub Pages (HTTPS).

## Autopilot (fills the forms for you)

1. Install [Node.js](https://nodejs.org).
2. Download this repo (Code → Download ZIP), unzip it, and in that folder run `npm install` (once; downloads a browser).
3. On the site, queue jobs in step 4 → **Export Autopilot pack** → save `reverseapply-pack.json` into the same folder.
4. `npm start`: opens each application, fills your details, uploads the tailored PDF, and waits for you to review and submit.
   `npm start -- --submit`: also presses Submit on forms with no extra required questions and no CAPTCHA. Anything else waits for you.

Results are logged to `applied-log.csv`.

## Honest limits

- Nobody can guarantee an interview or an offer. ReverseApply raises your odds by applying early, only to strong fits, with a resume that matches each posting.
- Keywords are reordered and emphasised, **never invented**. Only skills you confirm get added.
- Some sites use CAPTCHAs or account logins; Autopilot hands those to you instead of bypassing them.
- Respect each site's terms. Quality beats volume: 10 tailored 4.5+ applications beat 200 generic ones.

## Project layout

```
index.html      landing page + app
style.css
app.js          UI and state (localStorage)
search.js       Greenhouse / Lever / Ashby / Remotive / Jobicy / Arbeitnow fetchers
companies.js    verified employer boards (add your own)
score.js        1–5 fit score
skills.js       keyword dictionary
resume.js       PDF/DOCX parsing and profile extraction
tailor.js       tailored resume, PDF (jsPDF), cover letter, answers
ai.js           optional Claude features (7-reviewer panel, AI tailoring)
autopilot.mjs   Playwright form filler (npm start)
```

Inspired by [career-ops](https://github.com/career-ops-hq/career-ops) (MIT). MIT licensed.

# SafetyTAP Website — Project Context

## What This Is
Marketing website and automated content platform for SafetyTAP. Landing page sells the philosophy, daily blog builds SEO authority around safety psychology.

**Stack:** Astro + Tailwind CSS + MDX blog, hosted on Vercel
**Dev:** `npm run dev` → http://localhost:4321
**Deploy:** Push to `main` on GitHub → Vercel auto-builds

---

## Automated Daily Content System

The site runs a fully automated daily blog publishing pipeline:

### Architecture
```
Topic Bank (topic-bank.json, 180 days)
    ↓
Research Agent (research-agent.js) — scrapes RSS/news daily
    ↓
Content Engine (daily-generate.js) — picks next topic + research, writes post
    ↓
GitHub Actions (daily-post.yml) — commits + pushes daily at 6am ET
    ↓
Vercel — auto-deploys on push
    ↓
Calendar Dashboard (/admin/schedule) — view published + upcoming posts
```

### Key Files
- `content-engine/topic-bank.json` — 180 scheduled topics organized by pillar and format
- `content-engine/research-agent.js` — RSS scraper + news gatherer
- `content-engine/research-feed.json` — Latest research findings (regenerated daily)
- `content-engine/daily-generate.js` — Enhanced content engine for automated daily posts
- `content-engine/generate.js` — Original manual generation script (still works)
- `content-engine/schedule.json` — Maps calendar dates to topic days, tracks status
- `.github/workflows/daily-post.yml` — GitHub Actions cron job
- `src/pages/admin/schedule.astro` — Content calendar dashboard

### Pillars (content categories)
1. `hazard-recognition` — Perception, attention, scanning, pattern recognition
2. `cognitive-bias` — Normalcy bias, optimism bias, anchoring, Dunning-Kruger
3. `crew-dynamics` — Bystander effect, conformity, psychological safety
4. `learning-development` — Deliberate practice, habits, expertise, mentoring
5. `safety-culture` — Just culture, leading indicators, organizational factors
6. `human-factors` — Fatigue, stress, distraction, complacency
7. `risk-perception` — Risk homeostasis, framing, loss aversion
8. `incident-prevention` — Swiss cheese model, systems thinking, near-miss value

### Post Formats
- `deep-dive` (1000-1200 words)
- `field-tip` (400-600 words)
- `myth-buster` (600-800 words)
- `incident-analysis` (800-1000 words)
- `research-spotlight` (600-800 words)
- `leadership-brief` (600-800 words)

---

## Brand Voice Rules
- Write like a sharp construction professional who understands the psychology
- The SYSTEM is broken, not the people — never blame workers
- Use "crew" not "employees", "site" not "workplace"
- No corporate jargon, no buzzwords, no exclamation marks
- Short paragraphs (2-4 sentences), declarative sentences
- Every concept must connect to a real construction scenario
- SafetyTAP mentioned naturally at end, never as a sales pitch

## Design
- **Colors:** Navy (#1B2A4A), Steel Blue (#3D5A80), Teal (#2A9D8F), Warm Accent (#E76F51)
- **Font:** Inter
- **Layout:** Tailwind CSS utilities

## Important Constraints
- Blog posts should work perfectly with or without hero images
- Images will be added manually by Travis (real photos, not AI-generated)
- The `heroImage` frontmatter field is optional — templates handle both cases
- API keys stored as GitHub Secrets for the Actions pipeline
- The content-engine/topics.json is the ORIGINAL 10 topics (kept for reference)
- topic-bank.json is the new 180-day system

## GitHub Secrets Needed
- `ANTHROPIC_API_KEY` — for Claude API calls in content generation and research agent

## Running Locally
```bash
npm install
npm run dev          # Start dev server
npm run research     # Run research agent manually
npm run daily        # Generate today's post manually
npm run schedule     # View/manage the content schedule
```

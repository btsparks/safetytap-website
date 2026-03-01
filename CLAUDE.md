# SafetyTAP Website — Project Context

## What This Is
Marketing website and automated content platform for SafetyTAP. Landing page sells the philosophy, daily blog builds SEO authority around safety psychology.

**Stack:** Astro + Tailwind CSS + MDX blog, @astrojs/vercel adapter
**Live:** safetytap-website.vercel.app
**GitHub:** github.com/btsparks/safetytap-website
**Dev:** `npm run dev` → http://localhost:4321
**Deploy:** Push to `main` on GitHub → Vercel auto-builds

---

## Automated Daily Content System

The site runs a fully automated daily blog publishing pipeline:

### Architecture
```
Topic Bank (topic-bank.json, 180 days)
    ↓
Research Agent (research-agent.js) — topic-aware RSS/web search daily
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
- `content-engine/research-agent.js` — Topic-aware RSS scraper + web search + Claude analysis
- `content-engine/research-feed.json` — Latest research findings (regenerated daily, gitignored)
- `content-engine/daily-generate.js` — Content engine with research integration + editorial notes
- `content-engine/schedule.json` — Maps calendar dates to topic days, tracks status
- `content-engine/init-schedule.js` — Initialize or view schedule status
- `content-engine/generate.js` — Original manual generation script (still works)
- `.github/workflows/daily-post.yml` — GitHub Actions cron job (6am ET / 11:00 UTC)
- `src/pages/admin/schedule.astro` — Content calendar dashboard
- `src/pages/api/save-note.ts` — API for saving editorial notes
- `src/pages/api/upload-image.ts` — API for uploading hero images (sharp resize)

### Research Agent — RSS Sources (5 active)
- OSHA News Releases — `osha.gov/news/newsreleases.xml`
- Safety+Health Magazine — `safetyandhealthmagazine.com/feed`
- Construction Dive — `constructiondive.com/feeds/news/`
- ISHN Construction Safety — `ishn.com/rss/topic/2193-construction-industry-safety-and-health`
- ENR Safety — `enr.com/rss/topic/172-safety`

Web searches are topic-aware: agent reads schedule, finds next topic, builds searches from keyword + pillar + psychological concept instead of generic queries.

### Research → Article Integration
- `findRelevantResearch()` filters by pillar match OR meaningful keyword match (stop words filtered)
- Top 3 articles passed with directive to integrate each substantively
- Each research item must be used as concrete example, data point, or real-world illustration

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

## Admin Dashboard (/admin/schedule)
- **Status filters**: All / Published / Scheduled
- **Detail panel**: Click any post for topic details, editorial notes, image upload
- **Editorial notes**: Guidance text fed to Claude during generation
- **Image upload**: Drag-and-drop, auto-resized to 1200x630 via sharp
- **Vercel warning**: Amber banner on live site — editing requires localhost
- **API routes**: `/api/save-note` (POST JSON), `/api/upload-image` (POST FormData)

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
- Must use @astrojs/vercel adapter (NOT @astrojs/node — causes 404 on Vercel)
- Blog posts work with or without hero images — heroImage field is optional
- Images added manually by Travis (real photos, not AI-generated)
- Admin features (notes, image upload) only work on localhost — read-only on Vercel
- All date math must use Date.UTC() — local time causes DST/timezone bugs
- GitHub Actions workflow must use ESM imports (project is "type": "module")
- research-feed.json is gitignored (regenerated daily)

## Schedule Status
- **Start date**: 2026-02-26
- **Published**: Days 1-4 (Day 3 auto-generated by GitHub Actions bot)
- **Pipeline**: Confirmed working end-to-end

## GitHub Secrets
- `ANTHROPIC_API_KEY` — for Claude API calls in content generation and research agent (added)

## Running Locally
```bash
npm install
npm run dev          # Start dev server
npm run research     # Run research agent manually
npm run daily        # Generate today's post manually
npm run schedule     # View/manage the content schedule
```

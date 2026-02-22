# SafetyTAP Website

The marketing and content platform for SafetyTAP. A landing page that sells the philosophy and a blog that builds SEO authority around safety psychology.

Built with Astro + Tailwind CSS. Hosted on Vercel.

---

## Prerequisites

- Node.js 18 or later
- An Anthropic API key (only needed for generating blog posts)

---

## Running Locally

Install dependencies:

```
npm install
```

Start the dev server:

```
npm run dev
```

Open http://localhost:4321 in your browser.

---

## Site Structure

```
/                  Landing page (9 sections — problem, insight, how it works, science, etc.)
/blog              Blog index — all posts sorted by date
/blog/[slug]       Individual blog post
/about             About SafetyTAP and FieldBridge AI
/contact           Contact form
/privacy           Privacy policy
```

---

## Blog Posts

Blog posts live in `src/content/blog/` as `.mdx` files. Each post has frontmatter at the top:

```yaml
---
title: "Post Title"
description: "Short description for SEO and social sharing"
date: "2026-02-22"
tags: ["psychology", "hazard-recognition"]
readTime: "6 min"
featured: true
seoKeywords: ["target keyword one", "target keyword two"]
---
```

To add a post manually, create a new `.mdx` file in `src/content/blog/` and write your content in markdown below the frontmatter.

---

## Content Engine (Automated Blog Generation)

The content engine generates blog post drafts using Claude's API. All 10 foundational topics are pre-loaded in `content-engine/topics.json`.

### Setup

Copy `.env.example` to `.env` and add your Anthropic API key:

```
cp .env.example .env
```

### Generate Posts

See available topics:
```
npm run generate
```

Generate a specific post:
```
npm run generate -- inattentional-blindness-construction
```

Generate all posts:
```
npm run generate -- --all
```

Posts are saved to `src/content/blog/`. The engine skips any topic that already has an MDX file, so you can run `--all` safely without overwriting existing posts.

### Review Before Publishing

Generated posts are drafts. Read each one, edit as needed, then commit and push. The site rebuilds automatically on deploy.

---

## Deploying to Vercel

1. Push this project to a new GitHub repo (e.g., `safetytap-website`).

2. Go to [vercel.com](https://vercel.com) and sign up with your GitHub account.

3. Click **Add New** > **Project** and import the `safetytap-website` repo.

4. Vercel auto-detects Astro. The default settings work — just click **Deploy**.

5. Your site will be live at a `.vercel.app` URL within a minute.

### Custom Domain

Once you register a domain (safetytap.com, etc.):
1. In Vercel, go to your project > **Settings** > **Domains**.
2. Add your domain.
3. Vercel will give you DNS records to add at your domain registrar.
4. SSL is automatic.

### Auto-Deploy

Every push to `main` on GitHub triggers a new build and deploy on Vercel. Edit a blog post, push, and it's live in under a minute.

---

## Editing the Landing Page

The landing page lives in `src/pages/index.astro`. All the copy is directly in the file — edit the text, push, and it redeploys.

---

## Design

- **Colors:** Navy (#1B2A4A), Steel Blue (#3D5A80), Teal (#2A9D8F), Warm Accent (#E76F51)
- **Font:** Inter (loaded from Google Fonts)
- **Layout:** Tailwind CSS utility classes
- All styles are in the component files — no separate CSS files to hunt through.

---

## Contact Form

The contact form uses Netlify Forms or can be adapted for any form backend. If deploying to Vercel, you'll need a form handling service. Options:
- **Formspree** (formspree.io) — free tier, paste their endpoint URL into the form action
- **Basin** (usebasin.com) — free tier, similar setup
- **Google Forms** embed — simplest but least professional

The form currently has a `data-netlify="true"` attribute. For Vercel deployment, replace the form action with your chosen form service endpoint.

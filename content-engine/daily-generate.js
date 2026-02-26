// ============================================================================
// SafetyTAP Daily Content Generator
// ============================================================================
//
// Enhanced content engine for the automated daily publishing pipeline.
// Picks the next scheduled topic, integrates research feed, generates a
// blog post, and saves it as an MDX file ready for Vercel deploy.
//
// Usage:
//   node content-engine/daily-generate.js              # Generate next scheduled post
//   node content-engine/daily-generate.js --day 42     # Generate a specific day's post
//   node content-engine/daily-generate.js --preview    # Show what would be generated (no API call)
//
// ============================================================================

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOPIC_BANK_PATH = path.join(__dirname, 'topic-bank.json');
const SCHEDULE_PATH = path.join(__dirname, 'schedule.json');
const RESEARCH_FEED_PATH = path.join(__dirname, 'research-feed.json');
const BLOG_DIR = path.join(__dirname, '..', 'src', 'content', 'blog');

const PREVIEW_MODE = process.argv.includes('--preview');
const SPECIFIC_DAY = (() => {
  const idx = process.argv.indexOf('--day');
  return idx !== -1 ? parseInt(process.argv[idx + 1], 10) : null;
})();

const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';

// ---------------------------------------------------------------------------
// System Prompt — the voice and structure of every SafetyTAP post
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are writing a blog post for SafetyTAP, a construction safety technology company that builds hazard recognition skills in field workers. Workers text a photo of their work area and get back one specific safety observation — the kind an experienced pro would make on-site. No app, no training, just a text message.

The blog targets safety managers, superintendents, and construction professionals who are tired of compliance theater and want to actually develop their crew's ability to see hazards.

VOICE:
- Write like a sharp construction professional who understands the psychology. Not an academic, not a marketer.
- Respect the worker. NEVER make field workers sound lazy, reckless, or stupid. The SYSTEM is broken, not the people.
- Use "crew" not "employees." Use "site" not "workplace."
- Sound like you've been on jobsites and actually watched how people work.

STRUCTURE RULES:
- Short paragraphs (2-4 sentences max). No walls of text.
- Use subheadings (##) to break up content. Make them interesting — not "Introduction" or "Conclusion."
- No bullet points or numbered lists in the body. Write in prose.
- No marketing buzzwords. No "revolutionary" or "game-changing."
- No corporate safety cliches. No "safety is our #1 priority."
- No exclamation marks.
- The first paragraph must hook with a specific, recognizable jobsite scenario — not a statistic or definition.
- Cite research by describing the finding in plain language with the researcher's name. No academic citation format.
- End with a thought-provoking statement or question, not a sales pitch.
- SafetyTAP may be mentioned ONCE in the final section as a natural extension, but the post must stand completely on its own.

FORMAT GUIDELINES BY TYPE:

deep-dive (1000-1200 words):
- Thorough exploration of one concept. Open with a vivid jobsite scene. Build the psychology layer by layer. Close with practical implications.

field-tip (400-600 words):
- Quick, practical, useful. One core idea, one thing the reader can use today. Conversational tone. Gets to the point fast.

myth-buster (600-800 words):
- Start by stating the common belief. Then dismantle it with evidence and jobsite reality. Respectful but direct.

incident-analysis (800-1000 words):
- Describe a realistic incident scenario (composite, not a specific real event unless from public OSHA records). Analyze through a psychological lens. Focus on systemic factors, not blame.

research-spotlight (600-800 words):
- Highlight one specific study or researcher. Translate the findings into construction language. Connect to daily work.

leadership-brief (600-800 words):
- Targeted at safety managers and superintendents. Focus on what leaders can DO differently. Practical, not theoretical.

OUTPUT:
- Clean markdown. No frontmatter (added separately).
- Use ## for section headings.
- Do NOT include the title as an H1.`;

// ---------------------------------------------------------------------------
// Schedule Management
// ---------------------------------------------------------------------------

function loadSchedule() {
  if (fs.existsSync(SCHEDULE_PATH)) {
    return JSON.parse(fs.readFileSync(SCHEDULE_PATH, 'utf-8'));
  }
  return { startDate: new Date().toISOString().split('T')[0], posts: {} };
}

function saveSchedule(schedule) {
  fs.writeFileSync(SCHEDULE_PATH, JSON.stringify(schedule, null, 2), 'utf-8');
}

function getNextScheduledDay(schedule) {
  const posts = schedule.posts || {};
  // Find the lowest day number that hasn't been generated yet
  for (let day = 1; day <= 180; day++) {
    if (!posts[day] || posts[day].status !== 'published') {
      return day;
    }
  }
  return null; // All 180 days complete
}

function getDateForDay(schedule, day) {
  const [y, m, d] = schedule.startDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + (day - 1))).toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Research Feed Integration
// ---------------------------------------------------------------------------

function loadResearchFeed() {
  if (!fs.existsSync(RESEARCH_FEED_PATH)) {
    console.log('No research feed found. Generating without current events.');
    return null;
  }

  const feed = JSON.parse(fs.readFileSync(RESEARCH_FEED_PATH, 'utf-8'));

  // Only use feed if it's less than 48 hours old
  const feedAge = Date.now() - new Date(feed.generatedAt).getTime();
  if (feedAge > 48 * 60 * 60 * 1000) {
    console.log('Research feed is stale (>48h). Generating without current events.');
    return null;
  }

  return feed;
}

function findRelevantResearch(topic, feed) {
  if (!feed || !feed.items) return [];

  // Find articles that match this topic's pillar
  return feed.items
    .filter(item => {
      if (item.relevanceScore < 0.5) return false;
      // Match on pillar overlap
      const pillarMatch = item.relevancePillars?.some(p =>
        p === topic.pillar || p.includes(topic.pillar.split('-')[0])
      );
      // Match on keyword overlap
      const keywordMatch = topic.targetKeyword.split(' ').some(kw =>
        item.title.toLowerCase().includes(kw) ||
        item.summary?.toLowerCase().includes(kw)
      );
      return pillarMatch || keywordMatch;
    })
    .slice(0, 3); // Top 3 relevant articles
}

// ---------------------------------------------------------------------------
// Post Generation
// ---------------------------------------------------------------------------

async function generatePost(anthropic, topic, researchItems, editorialNote) {
  let brief = `Write a blog post based on this brief:

Title: ${topic.title}
Format: ${topic.format}
Target Keyword: ${topic.targetKeyword}
Psychological Concept: ${topic.psychologicalConcept}
Construction Framing: ${topic.constructionFraming}
Research References: ${topic.researchReferences.join(', ')}
SafetyTAP Connection: ${topic.safetyTapConnection}
Target Length: ${topic.targetLength}
Tone: ${topic.tone}`;

  if (editorialNote) {
    brief += `\n\nEDITORIAL GUIDANCE FROM THE EDITOR (incorporate this direction into the post):
${editorialNote}`;
  }

  if (researchItems && researchItems.length > 0) {
    brief += `\n\nRECENT RELEVANT NEWS (weave in naturally if applicable — do not force):`;
    researchItems.forEach((item, i) => {
      brief += `\n${i + 1}. "${item.title}" — ${item.summary}`;
      if (item.potentialAngles?.length > 0) {
        brief += `\n   Possible angle: ${item.potentialAngles[0]}`;
      }
    });
  }

  brief += '\n\nWrite the post now.';

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: brief }],
  });

  return response.content[0].text;
}

function buildFrontmatter(topic, publishDate) {
  // Estimate read time based on format
  const readTimes = {
    'deep-dive': '6 min',
    'field-tip': '3 min',
    'myth-buster': '4 min',
    'incident-analysis': '5 min',
    'research-spotlight': '4 min',
    'leadership-brief': '4 min',
  };

  const readTime = readTimes[topic.format] || '5 min';

  // Build tags from pillar + format + keywords
  const tags = [
    topic.pillar,
    topic.format,
    ...topic.targetKeyword.split(' ').filter(w => w.length > 4).slice(0, 2),
  ];

  // Generate a proper description from the psychological concept
  const description = topic.psychologicalConcept.length > 155
    ? topic.psychologicalConcept.slice(0, 152) + '...'
    : topic.psychologicalConcept;

  return `---
title: "${topic.title.replace(/"/g, '\\"')}"
description: "${description.replace(/"/g, '\\"')}"
date: "${publishDate}"
tags: ${JSON.stringify([...new Set(tags)])}
readTime: "${readTime}"
featured: ${topic.format === 'deep-dive'}
seoKeywords: ${JSON.stringify([topic.targetKeyword])}
pillar: "${topic.pillar}"
format: "${topic.format}"
---`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n  SafetyTAP Daily Content Generator');
  console.log(`  ${new Date().toISOString()}\n`);

  // Load topic bank
  if (!fs.existsSync(TOPIC_BANK_PATH)) {
    console.error('ERROR: topic-bank.json not found. Run the topic bank builder first.');
    process.exit(1);
  }

  const topics = JSON.parse(fs.readFileSync(TOPIC_BANK_PATH, 'utf-8'));
  console.log(`Topic bank: ${topics.length} topics loaded`);

  // Load or initialize schedule
  const schedule = loadSchedule();
  console.log(`Schedule start date: ${schedule.startDate}`);

  // Determine which day to generate
  const targetDay = SPECIFIC_DAY || getNextScheduledDay(schedule);

  if (!targetDay) {
    console.log('All 180 days have been published. Topic bank is complete.');
    process.exit(0);
  }

  const topic = topics.find(t => t.day === targetDay);
  if (!topic) {
    console.error(`ERROR: No topic found for day ${targetDay}`);
    process.exit(1);
  }

  const publishDate = getDateForDay(schedule, targetDay);

  console.log(`\nGenerating day ${targetDay}/${topics.length}:`);
  console.log(`  Title:   ${topic.title}`);
  console.log(`  Pillar:  ${topic.pillar}`);
  console.log(`  Format:  ${topic.format}`);
  console.log(`  Date:    ${publishDate}`);
  console.log(`  Slug:    ${topic.slug}`);

  // Check if already exists
  const outFile = path.join(BLOG_DIR, `${topic.slug}.mdx`);
  if (fs.existsSync(outFile)) {
    console.log(`\nSKIP: ${topic.slug}.mdx already exists`);
    process.exit(0);
  }

  if (PREVIEW_MODE) {
    console.log('\nPREVIEW MODE: Showing topic details without generating.');
    console.log(`\nResearch refs: ${topic.researchReferences.join(', ')}`);
    console.log(`SafetyTAP angle: ${topic.safetyTapConnection}`);
    console.log(`Keyword: ${topic.targetKeyword}`);
    process.exit(0);
  }

  // Load research feed for real-world grounding
  const feed = loadResearchFeed();
  const relevantResearch = findRelevantResearch(topic, feed);

  if (relevantResearch.length > 0) {
    console.log(`\nResearch integration: ${relevantResearch.length} relevant articles found`);
    relevantResearch.forEach((item, i) => {
      console.log(`  ${i + 1}. ${item.title}`);
    });
  } else {
    console.log('\nNo recent research to integrate (generating from topic brief only)');
  }

  // Check for editorial notes
  const editorialNote = schedule.posts?.[targetDay]?.editorialNote || null;
  if (editorialNote) {
    console.log(`\nEditorial note found: "${editorialNote}"`);
  }

  // Generate
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY not set in environment');
    process.exit(1);
  }

  const anthropic = new Anthropic();
  console.log('\nGenerating post...');

  const content = await generatePost(anthropic, topic, relevantResearch, editorialNote);
  const frontmatter = buildFrontmatter(topic, publishDate);
  const fullContent = `${frontmatter}\n\n${content}\n`;

  // Ensure blog directory exists
  if (!fs.existsSync(BLOG_DIR)) {
    fs.mkdirSync(BLOG_DIR, { recursive: true });
  }

  fs.writeFileSync(outFile, fullContent, 'utf-8');
  console.log(`\nSaved: src/content/blog/${topic.slug}.mdx`);

  // Update schedule (preserve existing notes and image data)
  if (!schedule.posts) schedule.posts = {};
  const existing = schedule.posts[targetDay] || {};
  schedule.posts[targetDay] = {
    ...existing,
    slug: topic.slug,
    title: topic.title,
    date: publishDate,
    pillar: topic.pillar,
    format: topic.format,
    status: 'published',
    generatedAt: new Date().toISOString(),
    hadResearchIntegration: relevantResearch.length > 0,
    hadEditorialNote: !!editorialNote,
  };
  saveSchedule(schedule);
  console.log('Schedule updated.');

  // Summary
  const wordCount = content.split(/\s+/).length;
  console.log(`\nWord count: ~${wordCount}`);
  console.log('Done.');
}

main().catch(err => {
  console.error(`\nFATAL: ${err.message}`);
  process.exit(1);
});

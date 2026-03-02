// ============================================================================
// SafetyTAP Hero Image Fetcher
// ============================================================================
//
// Fetches stock photos from Pexels for blog posts missing hero images.
// Downloads, processes with sharp (1200x630 JPEG), updates MDX frontmatter
// and schedule.json. Never overwrites manually uploaded images.
//
// Usage:
//   node content-engine/fetch-hero-image.js                  # Latest post missing an image
//   node content-engine/fetch-hero-image.js --day 3          # Specific day
//   node content-engine/fetch-hero-image.js --backfill       # All posts missing images
//   node content-engine/fetch-hero-image.js --replace-pexels # Re-fetch all pexels images (not manual)
//   node content-engine/fetch-hero-image.js --dry-run        # Show search queries, don't fetch
//
// ============================================================================

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEDULE_PATH = path.join(__dirname, 'schedule.json');
const TOPIC_BANK_PATH = path.join(__dirname, 'topic-bank.json');
const BLOG_DIR = path.join(__dirname, '..', 'src', 'content', 'blog');
const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images', 'blog');

const HERO_WIDTH = 1200;
const HERO_HEIGHT = 630;
const QUALITY = 85;

const DRY_RUN = process.argv.includes('--dry-run');
const BACKFILL = process.argv.includes('--backfill');
const REPLACE_PEXELS = process.argv.includes('--replace-pexels');
const SPECIFIC_DAY = (() => {
  const idx = process.argv.indexOf('--day');
  return idx !== -1 ? parseInt(process.argv[idx + 1], 10) : null;
})();

// ---------------------------------------------------------------------------
// Pillar → Search Terms (tier 1 prefix for Pexels queries)
// ---------------------------------------------------------------------------

// Every query is anchored to "construction site" — Pexels returns off-topic
// results (offices, parks, transit) without a strong construction qualifier.
// All terms target U.S. commercial/industrial construction aesthetic.
const PILLAR_SEARCH_TERMS = {
  'hazard-recognition':   'construction site hard hat worker inspecting',
  'cognitive-bias':       'construction site workers looking up scaffolding',
  'crew-dynamics':        'construction crew hard hats building site',
  'learning-development': 'construction site apprentice training hard hat',
  'safety-culture':       'construction site toolbox talk safety meeting',
  'human-factors':        'construction worker hard hat break jobsite',
  'risk-perception':      'construction site workers scaffolding height',
  'incident-prevention':  'construction site safety inspection hard hat',
};

const GENERIC_FALLBACK = 'construction site workers hard hats building';

// ---------------------------------------------------------------------------
// Pexels API
// ---------------------------------------------------------------------------

async function searchPexels(query, apiKey) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`;
  const res = await fetch(url, {
    headers: { Authorization: apiKey },
  });

  if (!res.ok) {
    throw new Error(`Pexels API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.photos || [];
}

async function downloadImage(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Image download failed: ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

// ---------------------------------------------------------------------------
// 3-Tier Search Strategy
// ---------------------------------------------------------------------------

async function findImage(topic, apiKey) {
  const pillarTerm = PILLAR_SEARCH_TERMS[topic.pillar] || GENERIC_FALLBACK;

  // Extract a meaningful keyword from the topic's targetKeyword
  const stopWords = new Set(['safety', 'construction', 'workers', 'work', 'site', 'crew', 'the', 'and', 'for', 'workplace']);
  const topicKeywords = topic.targetKeyword
    .split(' ')
    .filter(w => w.length > 3 && !stopWords.has(w.toLowerCase()));
  const topicKeyword = topicKeywords[0] || '';

  // Tier 1: pillar term + topic keyword
  const tier1Query = topicKeyword ? `${pillarTerm} ${topicKeyword}` : pillarTerm;
  console.log(`  Tier 1 search: "${tier1Query}"`);
  let photos = await searchPexels(tier1Query, apiKey);
  if (photos.length > 0) return { photo: photos[0], query: tier1Query, tier: 1 };

  // Tier 2: pillar term alone
  console.log(`  Tier 2 search: "${pillarTerm}"`);
  photos = await searchPexels(pillarTerm, apiKey);
  if (photos.length > 0) return { photo: photos[0], query: pillarTerm, tier: 2 };

  // Tier 3: generic fallback
  console.log(`  Tier 3 search: "${GENERIC_FALLBACK}"`);
  photos = await searchPexels(GENERIC_FALLBACK, apiKey);
  if (photos.length > 0) return { photo: photos[0], query: GENERIC_FALLBACK, tier: 3 };

  return null;
}

// ---------------------------------------------------------------------------
// Image Processing + Save
// ---------------------------------------------------------------------------

async function processAndSave(photo, slug) {
  // Use the "large" size from Pexels (good quality, reasonable download)
  const imageUrl = photo.src.large2x || photo.src.large || photo.src.original;
  console.log(`  Downloading from Pexels (photo ${photo.id})...`);

  const buffer = await downloadImage(imageUrl);

  // Ensure output directory exists
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }

  const outputPath = path.join(IMAGES_DIR, `${slug}.jpg`);

  await sharp(buffer)
    .resize(HERO_WIDTH, HERO_HEIGHT, {
      fit: 'cover',
      position: 'center',
    })
    .jpeg({ quality: QUALITY, progressive: true })
    .toFile(outputPath);

  const stats = fs.statSync(outputPath);
  const sizeKB = Math.round(stats.size / 1024);
  console.log(`  Saved: public/images/blog/${slug}.jpg (${sizeKB} KB)`);

  return `/images/blog/${slug}.jpg`;
}

// ---------------------------------------------------------------------------
// MDX Frontmatter Update
// ---------------------------------------------------------------------------

function updateMdxFrontmatter(slug, imagePath, credit) {
  const mdxPath = path.join(BLOG_DIR, `${slug}.mdx`);
  if (!fs.existsSync(mdxPath)) {
    console.log(`  WARNING: ${slug}.mdx not found — skipping frontmatter update`);
    return;
  }

  let content = fs.readFileSync(mdxPath, 'utf-8');

  // Add or replace heroImage
  if (content.includes('heroImage:')) {
    content = content.replace(/heroImage:.*\n/, `heroImage: "${imagePath}"\n`);
  } else {
    content = content.replace(/---\n\n/, `heroImage: "${imagePath}"\n---\n\n`);
  }

  // Add or replace imageCredit
  if (content.includes('imageCredit:')) {
    content = content.replace(/imageCredit:.*\n/, `imageCredit: "${credit}"\n`);
  } else {
    // Insert after heroImage line
    content = content.replace(
      `heroImage: "${imagePath}"\n`,
      `heroImage: "${imagePath}"\nimageCredit: "${credit}"\n`
    );
  }

  fs.writeFileSync(mdxPath, content, 'utf-8');
  console.log(`  Updated: src/content/blog/${slug}.mdx`);
}

// ---------------------------------------------------------------------------
// Schedule Update
// ---------------------------------------------------------------------------

function updateSchedule(schedule, day, imagePath, photographer, imageSource) {
  if (!schedule.posts) schedule.posts = {};
  if (!schedule.posts[day]) schedule.posts[day] = {};

  schedule.posts[day].heroImage = imagePath;
  schedule.posts[day].imageSource = imageSource;
  schedule.posts[day].imagePhotographer = photographer;
  schedule.posts[day].imageFetchedAt = new Date().toISOString();

  fs.writeFileSync(SCHEDULE_PATH, JSON.stringify(schedule, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Skip Logic — never overwrite existing images
// ---------------------------------------------------------------------------

function shouldSkip(day, schedule, topics) {
  const post = schedule.posts?.[day];
  const topic = topics.find(t => t.day === day);

  if (!topic) return { skip: true, reason: 'no topic in bank' };
  if (!post || post.status !== 'published') return { skip: true, reason: 'not published' };

  // Manual uploads are ALWAYS protected — never overwrite Travis's photos
  if (post.imageUploadedAt) return { skip: true, reason: 'manual image uploaded' };

  // --replace-pexels: allow re-fetching pexels-sourced images
  if (REPLACE_PEXELS && post.imageSource === 'pexels') {
    return { skip: false }; // will overwrite
  }

  // Check schedule.json for existing pexels image
  if (post.imageSource === 'pexels') return { skip: true, reason: 'pexels image already fetched' };

  // Check if image file exists on disk
  const imagePath = path.join(IMAGES_DIR, `${topic.slug}.jpg`);
  if (fs.existsSync(imagePath)) return { skip: true, reason: 'image file already exists' };

  // Check MDX frontmatter for heroImage
  const mdxPath = path.join(BLOG_DIR, `${topic.slug}.mdx`);
  if (fs.existsSync(mdxPath)) {
    const content = fs.readFileSync(mdxPath, 'utf-8');
    if (content.includes('heroImage:')) return { skip: true, reason: 'heroImage in frontmatter' };
  }

  return { skip: false };
}

// ---------------------------------------------------------------------------
// Process a Single Day
// ---------------------------------------------------------------------------

async function processDay(day, schedule, topics, apiKey) {
  const topic = topics.find(t => t.day === day);
  if (!topic) {
    console.log(`\nDay ${day}: No topic found — skipping`);
    return false;
  }

  console.log(`\nDay ${day}: "${topic.title}"`);
  console.log(`  Pillar: ${topic.pillar} | Slug: ${topic.slug}`);

  // Skip check
  const { skip, reason } = shouldSkip(day, schedule, topics);
  if (skip) {
    console.log(`  SKIP: ${reason}`);
    return false;
  }

  if (DRY_RUN) {
    const pillarTerm = PILLAR_SEARCH_TERMS[topic.pillar] || GENERIC_FALLBACK;
    const stopWords = new Set(['safety', 'construction', 'workers', 'work', 'site', 'crew', 'the', 'and', 'for', 'workplace']);
    const topicKeywords = topic.targetKeyword
      .split(' ')
      .filter(w => w.length > 3 && !stopWords.has(w.toLowerCase()));
    const topicKeyword = topicKeywords[0] || '';
    const tier1 = topicKeyword ? `${pillarTerm} ${topicKeyword}` : pillarTerm;
    console.log(`  [DRY RUN] Would search: "${tier1}"`);
    console.log(`  [DRY RUN] Fallback 1: "${pillarTerm}"`);
    console.log(`  [DRY RUN] Fallback 2: "${GENERIC_FALLBACK}"`);
    return true;
  }

  // Find an image
  const result = await findImage(topic, apiKey);
  if (!result) {
    console.log(`  ERROR: No images found on any tier — skipping`);
    return false;
  }

  const { photo, query, tier } = result;
  const photographer = photo.photographer || 'Unknown';
  const credit = `Photo by ${photographer} on Pexels`;

  console.log(`  Found: "${photo.alt || 'construction photo'}" by ${photographer} (tier ${tier})`);

  // Download + process
  const imagePath = await processAndSave(photo, topic.slug);

  // Update MDX frontmatter
  updateMdxFrontmatter(topic.slug, imagePath, credit);

  // Update schedule
  updateSchedule(schedule, day, imagePath, photographer, 'pexels');
  console.log(`  Schedule updated (imageSource: pexels)`);

  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n  SafetyTAP Hero Image Fetcher');
  console.log(`  ${new Date().toISOString()}\n`);

  // Validate API key (not needed for dry-run)
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey && !DRY_RUN) {
    console.error('ERROR: PEXELS_API_KEY not set in environment');
    console.error('Get a free API key at https://www.pexels.com/api/');
    process.exit(1);
  }

  // Load data
  if (!fs.existsSync(TOPIC_BANK_PATH)) {
    console.error('ERROR: topic-bank.json not found');
    process.exit(1);
  }

  const topics = JSON.parse(fs.readFileSync(TOPIC_BANK_PATH, 'utf-8'));
  const schedule = loadSchedule();

  console.log(`Topic bank: ${topics.length} topics`);
  console.log(`Schedule start: ${schedule.startDate}`);
  if (DRY_RUN) console.log('Mode: DRY RUN (no images will be fetched)');
  if (REPLACE_PEXELS) console.log('Mode: REPLACE PEXELS (re-fetching auto-sourced images)');
  console.log('');

  // Determine which days to process
  let days = [];

  if (SPECIFIC_DAY) {
    days = [SPECIFIC_DAY];
  } else if (REPLACE_PEXELS || BACKFILL) {
    // All published days missing images
    const posts = schedule.posts || {};
    for (const [dayStr, post] of Object.entries(posts)) {
      if (post.status === 'published') {
        days.push(parseInt(dayStr, 10));
      }
    }
    days.sort((a, b) => a - b);
    console.log(`Backfill mode: checking ${days.length} published posts`);
  } else {
    // Auto-detect: latest published post without an image
    const posts = schedule.posts || {};
    const publishedDays = Object.entries(posts)
      .filter(([, p]) => p.status === 'published')
      .map(([d]) => parseInt(d, 10))
      .sort((a, b) => b - a); // newest first

    for (const day of publishedDays) {
      const { skip } = shouldSkip(day, schedule, topics);
      if (!skip) {
        days = [day];
        break;
      }
    }

    if (days.length === 0) {
      console.log('All published posts already have hero images.');
      process.exit(0);
    }
  }

  // Process each day
  let fetched = 0;
  let skipped = 0;

  for (const day of days) {
    // Reload schedule each iteration (it gets written to disk between days)
    const currentSchedule = loadSchedule();
    const success = await processDay(day, currentSchedule, topics, apiKey);
    if (success) fetched++;
    else skipped++;
  }

  // Summary
  console.log(`\n--- Summary ---`);
  console.log(`Processed: ${fetched} image(s) ${DRY_RUN ? '(dry run)' : 'fetched'}`);
  if (skipped > 0) console.log(`Skipped: ${skipped}`);
  console.log('Done.\n');
}

function loadSchedule() {
  if (fs.existsSync(SCHEDULE_PATH)) {
    return JSON.parse(fs.readFileSync(SCHEDULE_PATH, 'utf-8'));
  }
  return { startDate: new Date().toISOString().split('T')[0], posts: {} };
}

main().catch(err => {
  console.error(`\nFATAL: ${err.message}`);
  process.exit(1);
});

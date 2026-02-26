// ============================================================================
// SafetyTAP Research Agent
// ============================================================================
//
// Gathers recent safety news, OSHA updates, construction incidents, and
// psychology research from RSS feeds and web search to feed the daily blog
// post generation pipeline.
//
// Usage:
//   node content-engine/research-agent.js            # Full run with Claude analysis
//   node content-engine/research-agent.js --dry-run  # Fetch feeds only, skip Claude API
//
// Required npm install:
//   npm install rss-parser
//
// ============================================================================

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import Parser from 'rss-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, 'research-feed.json');
const DRY_RUN = process.argv.includes('--dry-run');
const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';

// Delay between Claude API calls (ms) to avoid rate limits
const API_CALL_DELAY_MS = 1200;

// Max items to send through Claude analysis (keeps costs reasonable)
const MAX_ITEMS_FOR_ANALYSIS = 30;

const FEED_TIMEOUT_MS = 15000;

const RELEVANCE_PILLARS = [
  'hazard-recognition',
  'cognitive-bias',
  'crew-dynamics',
  'learning-development',
  'safety-culture',
  'human-factors',
  'risk-perception',
  'incident-prevention',
];

// ---------------------------------------------------------------------------
// RSS Feed Sources
// ---------------------------------------------------------------------------

const RSS_SOURCES = [
  {
    id: 'osha',
    name: 'OSHA News Releases',
    url: 'https://www.osha.gov/news/newsreleases/feed',
  },
  {
    id: 'safety-health-mag',
    name: 'Safety+Health Magazine',
    url: 'https://www.safetyandhealthmagazine.com/feed',
  },
  {
    id: 'construction-dive',
    name: 'Construction Dive',
    url: 'https://www.constructiondive.com/feeds/news/',
  },
  {
    id: 'ehs-today',
    name: 'EHS Today',
    url: 'https://www.ehstoday.com/rss',
  },
];

// ---------------------------------------------------------------------------
// Web Search Queries
// ---------------------------------------------------------------------------

function getSearchQueries() {
  const now = new Date();
  const monthYear = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  return [
    `construction safety incident ${monthYear}`,
    `OSHA citation construction ${monthYear}`,
    `workplace safety psychology research`,
    `hazard recognition study`,
  ];
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function warn(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.warn(`[${ts}] WARNING: ${msg}`);
}

// ---------------------------------------------------------------------------
// RSS Feed Fetching
// ---------------------------------------------------------------------------

async function fetchFeed(source) {
  const parser = new Parser({
    timeout: FEED_TIMEOUT_MS,
    headers: {
      'User-Agent': 'SafetyTAP-Research-Agent/1.0',
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
  });

  try {
    log(`Fetching: ${source.name}`);
    const feed = await parser.parseURL(source.url);

    if (!feed.items || feed.items.length === 0) {
      warn(`${source.name}: 0 items returned`);
      return [];
    }

    log(`  -> ${feed.items.length} items from ${source.name}`);

    return feed.items.map((item) => ({
      source: source.id,
      sourceName: source.name,
      title: cleanText(item.title || 'Untitled'),
      url: item.link || item.guid || '',
      publishedDate: parseDate(item.pubDate || item.isoDate),
      rawDescription: cleanText(
        item.contentSnippet || item.content || item.summary || ''
      ).slice(0, 1000),
    }));
  } catch (err) {
    warn(`${source.name}: Failed -- ${err.message}`);
    return [];
  }
}

async function fetchAllFeeds() {
  log('=== PHASE 1: Fetching RSS Feeds ===');

  const results = await Promise.allSettled(RSS_SOURCES.map(fetchFeed));
  const allItems = [];
  const activeSources = [];

  results.forEach((result, i) => {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      allItems.push(...result.value);
      activeSources.push(RSS_SOURCES[i].id);
    }
  });

  log(`Total fetched: ${allItems.length} from ${activeSources.length} sources`);
  return { items: allItems, activeSources };
}

// ---------------------------------------------------------------------------
// Web Search via Claude API
// ---------------------------------------------------------------------------

async function performWebSearch(anthropic) {
  log('\n=== PHASE 2: Web Search ===');

  if (DRY_RUN) {
    log('DRY RUN: Skipping web search');
    return [];
  }

  const queries = getSearchQueries();
  const results = [];

  for (const query of queries) {
    try {
      log(`Searching: "${query}"`);

      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Search the web for: "${query}"

Return a JSON array of up to 5 results. Each: {"title":"...","url":"...","publishedDate":"YYYY-MM-DD","rawDescription":"1-2 sentences"}
Return ONLY the JSON array. If no results, return [].`,
        }],
        tools: [{
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 3,
        }],
      });

      const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
      const parsed = extractJsonArray(text);

      if (parsed && parsed.length > 0) {
        results.push(...parsed.map(item => ({
          source: 'web-search',
          sourceName: `Web Search`,
          title: item.title || 'Untitled',
          url: item.url || '',
          publishedDate: item.publishedDate || new Date().toISOString().split('T')[0],
          rawDescription: item.rawDescription || '',
        })));
        log(`  -> ${parsed.length} results`);
      }

      await sleep(API_CALL_DELAY_MS);
    } catch (err) {
      warn(`Search failed for "${query}": ${err.message}`);
    }
  }

  log(`Total search results: ${results.length}`);
  return results;
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function deduplicateItems(items) {
  const seen = new Map();
  return items.filter((item) => {
    if (item.url && seen.has(item.url)) return false;
    const norm = item.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
    if (norm.length > 10 && seen.has(norm)) return false;
    if (item.url) seen.set(item.url, true);
    if (norm.length > 10) seen.set(norm, true);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Claude Analysis
// ---------------------------------------------------------------------------

async function analyzeArticles(anthropic, items) {
  log('\n=== PHASE 3: Claude Analysis ===');

  if (DRY_RUN) {
    log('DRY RUN: Returning unanalyzed items');
    return items.map(item => ({
      source: item.source,
      title: item.title,
      url: item.url,
      publishedDate: item.publishedDate,
      summary: item.rawDescription.slice(0, 200) || 'No summary (dry run)',
      relevancePillars: [],
      relevanceScore: 0,
      potentialAngles: [],
    }));
  }

  const toAnalyze = items.slice(0, MAX_ITEMS_FOR_ANALYSIS);
  const BATCH_SIZE = 5;
  const analyzed = [];

  for (let i = 0; i < toAnalyze.length; i += BATCH_SIZE) {
    const batch = toAnalyze.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(toAnalyze.length / BATCH_SIZE);
    log(`Analyzing batch ${batchNum}/${totalBatches}...`);

    try {
      const articleList = batch.map((item, idx) =>
        `ARTICLE ${idx + 1}:\nTitle: ${item.title}\nSource: ${item.sourceName}\nDate: ${item.publishedDate}\nDescription: ${item.rawDescription}`
      ).join('\n\n');

      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: `You are a research analyst for SafetyTAP, a construction safety company focused on hazard recognition psychology.

Analyze each article for relevance. For each, provide:
1. "summary": 1-2 sentence summary
2. "relevancePillars": array from ${JSON.stringify(RELEVANCE_PILLARS)}
3. "relevanceScore": 0.0-1.0 (1.0 = directly about construction safety/psychology)
4. "potentialAngles": 1-3 blog angle ideas connecting to safety psychology

${articleList}

Respond with ONLY a JSON array of objects. No other text.`,
        }],
      });

      const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
      const parsed = extractJsonArray(text);

      batch.forEach((item, idx) => {
        const analysis = parsed && parsed[idx] ? parsed[idx] : {};
        analyzed.push({
          source: item.source,
          title: item.title,
          url: item.url,
          publishedDate: item.publishedDate,
          summary: analysis.summary || item.rawDescription.slice(0, 200),
          relevancePillars: Array.isArray(analysis.relevancePillars)
            ? analysis.relevancePillars.filter(p => RELEVANCE_PILLARS.includes(p))
            : [],
          relevanceScore: typeof analysis.relevanceScore === 'number'
            ? Math.round(analysis.relevanceScore * 100) / 100 : 0,
          potentialAngles: Array.isArray(analysis.potentialAngles)
            ? analysis.potentialAngles : [],
        });
      });
    } catch (err) {
      warn(`Batch ${batchNum} failed: ${err.message}`);
      batch.forEach(item => {
        analyzed.push({
          source: item.source,
          title: item.title,
          url: item.url,
          publishedDate: item.publishedDate,
          summary: item.rawDescription.slice(0, 200) || 'Analysis unavailable',
          relevancePillars: [],
          relevanceScore: 0,
          potentialAngles: [],
        });
      });
    }

    if (i + BATCH_SIZE < toAnalyze.length) await sleep(API_CALL_DELAY_MS);
  }

  return analyzed;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function writeOutput(items, activeSources) {
  log('\n=== PHASE 4: Writing Output ===');

  items.sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
    return (b.publishedDate || '').localeCompare(a.publishedDate || '');
  });

  const output = {
    generatedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    sources: activeSources,
    totalItems: items.length,
    highRelevanceCount: items.filter(i => i.relevanceScore >= 0.7).length,
    items,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
  log(`Written: ${OUTPUT_PATH}`);
  log(`Total: ${items.length} | High relevance: ${output.highRelevanceCount}`);
  return output;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function cleanText(text) {
  if (!text) return '';
  return text.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function parseDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? new Date().toISOString().split('T')[0] : d.toISOString().split('T')[0];
  } catch { return new Date().toISOString().split('T')[0]; }
}

function extractJsonArray(text) {
  if (!text) return null;
  for (const pattern of [/```json\s*\n?([\s\S]*?)\n?\s*```/, /```\s*\n?([\s\S]*?)\n?\s*```/, /(\[[\s\S]*\])/]) {
    const match = text.match(pattern);
    if (match) {
      try { const p = JSON.parse(match[1]); if (Array.isArray(p)) return p; } catch {}
    }
  }
  try { const p = JSON.parse(text); if (Array.isArray(p)) return p; } catch {}
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const start = Date.now();
  console.log('\n  SafetyTAP Research Agent');
  console.log(`  ${new Date().toISOString()}`);
  if (DRY_RUN) console.log('  MODE: DRY RUN');
  console.log('');

  if (!DRY_RUN && !process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY not set. Use --dry-run or add to .env');
    process.exit(1);
  }

  const anthropic = new Anthropic();

  try {
    const { items: feedItems, activeSources } = await fetchAllFeeds();
    const searchItems = await performWebSearch(anthropic);

    const allItems = deduplicateItems([...feedItems, ...searchItems]);
    const allSources = [...activeSources];
    if (searchItems.length > 0) allSources.push('web-search');

    log(`\nAfter dedup: ${allItems.length} unique articles`);

    const analyzed = allItems.length > 0
      ? await analyzeArticles(anthropic, allItems)
      : [];

    const output = writeOutput(analyzed, allSources);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\nDone in ${elapsed}s. ${output.totalItems} articles, ${output.highRelevanceCount} high-relevance.`);
  } catch (err) {
    console.error(`\nFATAL: ${err.message}`);
    try { writeOutput([], []); } catch {}
    process.exit(1);
  }
}

main();

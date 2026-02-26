// ============================================================================
// Combine Topic Batches into Final Topic Bank
// ============================================================================
//
// Merges topics-batch-1.json, topics-batch-2.json, and topics-batch-3.json
// into a single topic-bank.json file, sorted by day number.
//
// Usage: node content-engine/combine-topics.js
//
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const batchFiles = [
  path.join(__dirname, 'topics-batch-1.json'),
  path.join(__dirname, 'topics-batch-2.json'),
  path.join(__dirname, 'topics-batch-3.json'),
];

const outputPath = path.join(__dirname, 'topic-bank.json');

console.log('\n  Combining topic batches into topic-bank.json\n');

const allTopics = [];
const missing = [];

for (const file of batchFiles) {
  const filename = path.basename(file);
  if (!fs.existsSync(file)) {
    missing.push(filename);
    console.log(`  MISSING: ${filename}`);
    continue;
  }

  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!Array.isArray(data)) {
      console.log(`  ERROR: ${filename} is not a JSON array`);
      continue;
    }
    console.log(`  Loaded: ${filename} — ${data.length} topics (days ${data[0]?.day}-${data[data.length - 1]?.day})`);
    allTopics.push(...data);
  } catch (err) {
    console.log(`  ERROR: ${filename} — ${err.message}`);
  }
}

if (missing.length > 0) {
  console.log(`\n  WARNING: ${missing.length} batch file(s) missing. Proceeding with available data.\n`);
}

// Sort by day number
allTopics.sort((a, b) => a.day - b.day);

// Validate: check for duplicate days
const days = allTopics.map(t => t.day);
const dupes = days.filter((d, i) => days.indexOf(d) !== i);
if (dupes.length > 0) {
  console.log(`  WARNING: Duplicate days found: ${[...new Set(dupes)].join(', ')}`);
}

// Validate: check for duplicate slugs
const slugs = allTopics.map(t => t.slug);
const dupeSlugs = slugs.filter((s, i) => slugs.indexOf(s) !== i);
if (dupeSlugs.length > 0) {
  console.log(`  WARNING: Duplicate slugs found: ${[...new Set(dupeSlugs)].join(', ')}`);
}

// Write combined file
fs.writeFileSync(outputPath, JSON.stringify(allTopics, null, 2), 'utf-8');

console.log(`\n  Combined: ${allTopics.length} topics`);
console.log(`  Output: ${outputPath}`);

// Stats
const pillarCounts = {};
const formatCounts = {};
allTopics.forEach(t => {
  pillarCounts[t.pillar] = (pillarCounts[t.pillar] || 0) + 1;
  formatCounts[t.format] = (formatCounts[t.format] || 0) + 1;
});

console.log('\n  By pillar:');
Object.entries(pillarCounts).sort((a, b) => b[1] - a[1]).forEach(([p, c]) => {
  console.log(`    ${p}: ${c}`);
});

console.log('\n  By format:');
Object.entries(formatCounts).sort((a, b) => b[1] - a[1]).forEach(([f, c]) => {
  console.log(`    ${f}: ${c}`);
});

console.log('');

// ============================================================================
// SafetyTAP Schedule Initializer
// ============================================================================
//
// Initializes or resets the content schedule. Sets a start date and maps
// each topic day to a calendar date.
//
// Usage:
//   node content-engine/init-schedule.js                    # Start from today
//   node content-engine/init-schedule.js --start 2026-03-01 # Start from specific date
//   node content-engine/init-schedule.js --status           # Show current schedule status
//
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEDULE_PATH = path.join(__dirname, 'schedule.json');
const TOPIC_BANK_PATH = path.join(__dirname, 'topic-bank.json');
const BLOG_DIR = path.join(__dirname, '..', 'src', 'content', 'blog');

const STATUS_MODE = process.argv.includes('--status');
const START_DATE = (() => {
  const idx = process.argv.indexOf('--start');
  return idx !== -1 ? process.argv[idx + 1] : new Date().toISOString().split('T')[0];
})();

function getDateForDay(startDate, day) {
  const [y, m, d] = startDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + (day - 1))).toISOString().split('T')[0];
}

function showStatus() {
  if (!fs.existsSync(SCHEDULE_PATH)) {
    console.log('No schedule found. Run without --status to initialize.');
    return;
  }

  const schedule = JSON.parse(fs.readFileSync(SCHEDULE_PATH, 'utf-8'));
  const posts = schedule.posts || {};
  const published = Object.entries(posts).filter(([, p]) => p.status === 'published');

  console.log('\n  SafetyTAP Content Schedule\n');
  console.log(`  Start date:    ${schedule.startDate}`);
  console.log(`  Published:     ${published.length}/180`);

  if (published.length > 0) {
    const latest = published.sort((a, b) => b[0] - a[0])[0];
    console.log(`  Latest:        Day ${latest[0]} — "${latest[1].title}" (${latest[1].date})`);
  }

  // Find next pending
  const topics = fs.existsSync(TOPIC_BANK_PATH)
    ? JSON.parse(fs.readFileSync(TOPIC_BANK_PATH, 'utf-8'))
    : [];

  for (let day = 1; day <= 180; day++) {
    if (!posts[day] || posts[day].status !== 'published') {
      const topic = topics.find(t => t.day === day);
      const date = getDateForDay(schedule.startDate, day);
      console.log(`  Next:          Day ${day} — "${topic?.title || 'Unknown'}" (${date})`);
      break;
    }
  }

  // Show upcoming 7 days
  console.log('\n  Upcoming week:');
  const today = new Date().toISOString().split('T')[0];
  let shown = 0;
  for (let day = 1; day <= 180 && shown < 7; day++) {
    const date = getDateForDay(schedule.startDate, day);
    if (date >= today && (!posts[day] || posts[day].status !== 'published')) {
      const topic = topics.find(t => t.day === day);
      const pillarTag = topic ? `[${topic.pillar}]` : '';
      const formatTag = topic ? `(${topic.format})` : '';
      console.log(`    ${date}  Day ${String(day).padStart(3)}  ${pillarTag} ${topic?.title || 'Unknown'} ${formatTag}`);
      shown++;
    }
  }

  // Pillar distribution
  console.log('\n  Published by pillar:');
  const pillarCounts = {};
  published.forEach(([, p]) => {
    pillarCounts[p.pillar] = (pillarCounts[p.pillar] || 0) + 1;
  });
  Object.entries(pillarCounts).sort((a, b) => b[1] - a[1]).forEach(([pillar, count]) => {
    console.log(`    ${pillar}: ${count}`);
  });

  console.log('');
}

function initSchedule() {
  if (!fs.existsSync(TOPIC_BANK_PATH)) {
    console.error('ERROR: topic-bank.json not found.');
    process.exit(1);
  }

  const topics = JSON.parse(fs.readFileSync(TOPIC_BANK_PATH, 'utf-8'));
  console.log(`\n  Initializing schedule with ${topics.length} topics`);
  console.log(`  Start date: ${START_DATE}\n`);

  // Check for existing published posts
  const existingPosts = {};
  if (fs.existsSync(BLOG_DIR)) {
    const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.mdx'));
    files.forEach(f => {
      const slug = f.replace('.mdx', '');
      const topic = topics.find(t => t.slug === slug);
      if (topic) {
        existingPosts[topic.day] = {
          slug,
          title: topic.title,
          date: getDateForDay(START_DATE, topic.day),
          pillar: topic.pillar,
          format: topic.format,
          status: 'published',
          generatedAt: 'pre-existing',
        };
      }
    });
  }

  const schedule = {
    startDate: START_DATE,
    totalDays: topics.length,
    posts: existingPosts,
  };

  fs.writeFileSync(SCHEDULE_PATH, JSON.stringify(schedule, null, 2), 'utf-8');

  console.log(`  Schedule created: ${SCHEDULE_PATH}`);
  console.log(`  Pre-existing posts found: ${Object.keys(existingPosts).length}`);
  console.log(`  Remaining to generate: ${topics.length - Object.keys(existingPosts).length}`);

  // Show first 7 days
  console.log('\n  First week:');
  for (let day = 1; day <= 7 && day <= topics.length; day++) {
    const topic = topics.find(t => t.day === day);
    const date = getDateForDay(START_DATE, day);
    const status = existingPosts[day] ? 'PUBLISHED' : 'pending';
    console.log(`    ${date}  [${status.padEnd(9)}]  ${topic?.title || 'Unknown'}`);
  }

  console.log('');
}

if (STATUS_MODE) {
  showStatus();
} else {
  initSchedule();
}

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const anthropic = new Anthropic();

// The content generation system prompt from CONTENT_STRATEGY.md
const SYSTEM_PROMPT = `You are writing a blog post for SafetyTAP, a construction safety technology company that builds tools to develop hazard recognition skills in field workers. The blog targets safety managers, superintendents, and construction professionals.

WRITING RULES:
- Write like a sharp construction professional who understands the psychology. Not an academic, not a marketer.
- Every psychological concept MUST be explained through a specific construction example. If you can't illustrate it on a jobsite, cut it.
- Short paragraphs (2-4 sentences max). No walls of text.
- Use subheadings to break up the content, but make them interesting — not "Introduction" or "Conclusion."
- No bullet points or numbered lists in the body. Write in prose.
- No marketing buzzwords. No "revolutionary" or "game-changing."
- No corporate safety clichés. No "safety is our #1 priority."
- No exclamation marks.
- Cite research by describing the finding in plain language. Include the researcher's name and a brief description of the study. Do not use academic citation format.
- The first paragraph must hook the reader with a specific, recognizable scenario — not a statistic or a definition.
- SafetyTAP may be mentioned in the final section as a natural extension of the concepts discussed, but the post must provide genuine value even if the reader never uses the product. The post educates; it does not sell.
- Target length is specified in the brief. Stay within 10% of the target.
- End with a thought-provoking statement or question, not a sales pitch.

STRUCTURE:
1. Opening hook — A specific, vivid construction scenario that illustrates the concept (2-3 sentences)
2. The concept — What the psychological principle is, explained in plain language with the construction context
3. The science — The research behind it, translated for a construction audience
4. The field reality — How this plays out on real jobsites, with specific examples across trades
5. The implication — What this means for safety culture, training, or leadership
6. The path forward — How to address the concept practically (SafetyTAP may appear here naturally, never forcefully)

FORMAT:
- Output as clean markdown (no frontmatter — that gets added separately)
- Use ## for section headings
- Do not include the title as an H1 — that's handled by the template`;

async function generatePost(topic) {
  const brief = `Write a blog post based on this brief:

Title: ${topic.title}
Target Keyword: ${topic.targetKeyword}
Psychological Concept: ${topic.psychologicalConcept}
Construction Framing: ${topic.constructionFraming}
Research References: ${topic.researchReferences.join(', ')}
SafetyTAP Connection: ${topic.safetyTapConnection}
Target Length: ${topic.targetLength}
Tone: ${topic.tone}

Write the post now.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: brief }],
  });

  return response.content[0].text;
}

function buildFrontmatter(topic) {
  const today = new Date().toISOString().split('T')[0];
  // Estimate read time: ~200 words per minute, target ~1000 words
  const readTime = '6 min';

  return `---
title: "${topic.title}"
description: "${topic.psychologicalConcept.split(' — ')[1] || topic.psychologicalConcept}"
date: "${today}"
tags: ${JSON.stringify(topic.targetKeyword.split(' ').slice(0, 3))}
readTime: "${readTime}"
featured: true
seoKeywords: ${JSON.stringify([topic.targetKeyword])}
---`;
}

async function main() {
  const topicsPath = path.join(__dirname, 'topics.json');
  const topics = JSON.parse(fs.readFileSync(topicsPath, 'utf-8'));
  const outputDir = path.join(__dirname, '..', 'src', 'content', 'blog');

  // Check which topic to generate
  const slugArg = process.argv[2];

  if (slugArg === '--all') {
    console.log(`Generating all ${topics.length} posts...\n`);
    for (const topic of topics) {
      await generateOne(topic, outputDir);
    }
    console.log('\nAll posts generated.');
  } else if (slugArg) {
    const topic = topics.find(t => t.slug === slugArg);
    if (!topic) {
      console.error(`Topic not found: ${slugArg}`);
      console.log('Available slugs:');
      topics.forEach(t => console.log(`  ${t.slug}`));
      process.exit(1);
    }
    await generateOne(topic, outputDir);
  } else {
    console.log('Usage:');
    console.log('  npm run generate -- <slug>    Generate one post');
    console.log('  npm run generate -- --all     Generate all posts');
    console.log('\nAvailable topics:');
    topics.forEach((t, i) => console.log(`  ${i + 1}. ${t.slug} — "${t.title}"`));
  }
}

async function generateOne(topic, outputDir) {
  const outFile = path.join(outputDir, `${topic.slug}.mdx`);

  if (fs.existsSync(outFile)) {
    console.log(`SKIP: ${topic.slug} (already exists)`);
    return;
  }

  console.log(`Generating: ${topic.title}...`);
  const content = await generatePost(topic);
  const frontmatter = buildFrontmatter(topic);
  const fullContent = `${frontmatter}\n\n${content}\n`;

  fs.writeFileSync(outFile, fullContent, 'utf-8');
  console.log(`  Saved: src/content/blog/${topic.slug}.mdx`);
}

main().catch(console.error);

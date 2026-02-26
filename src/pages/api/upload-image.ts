export const prerender = false;

import type { APIRoute } from 'astro';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const IMAGES_DIR = path.resolve('public/images/blog');
const BLOG_DIR = path.resolve('src/content/blog');
const SCHEDULE_PATH = path.resolve('content-engine/schedule.json');
const TOPIC_BANK_PATH = path.resolve('content-engine/topic-bank.json');

// Target dimensions for hero images
const HERO_WIDTH = 1200;
const HERO_HEIGHT = 630;
const QUALITY = 85;

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File | null;
    const dayStr = formData.get('day') as string | null;

    if (!file || !dayStr) {
      return new Response(JSON.stringify({ error: 'Missing image or day' }), { status: 400 });
    }

    const day = parseInt(dayStr, 10);
    if (isNaN(day)) {
      return new Response(JSON.stringify({ error: 'Invalid day number' }), { status: 400 });
    }

    // Get the slug for this day from the topic bank
    const topics = JSON.parse(fs.readFileSync(TOPIC_BANK_PATH, 'utf-8'));
    const topic = topics.find((t: any) => t.day === day);
    if (!topic) {
      return new Response(JSON.stringify({ error: `No topic found for day ${day}` }), { status: 404 });
    }

    const slug = topic.slug;

    // Read the uploaded file into a buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Process image with sharp: resize to hero dimensions, optimize
    const outputFilename = `${slug}.jpg`;
    const outputPath = path.join(IMAGES_DIR, outputFilename);

    await sharp(buffer)
      .resize(HERO_WIDTH, HERO_HEIGHT, {
        fit: 'cover',
        position: 'center',
      })
      .jpeg({ quality: QUALITY, progressive: true })
      .toFile(outputPath);

    const imagePath = `/images/blog/${outputFilename}`;

    // Update the MDX file if it exists (add heroImage to frontmatter)
    const mdxPath = path.join(BLOG_DIR, `${slug}.mdx`);
    if (fs.existsSync(mdxPath)) {
      let content = fs.readFileSync(mdxPath, 'utf-8');

      if (content.includes('heroImage:')) {
        // Replace existing heroImage line
        content = content.replace(
          /heroImage:.*\n/,
          `heroImage: "${imagePath}"\n`
        );
      } else {
        // Add heroImage before the closing ---
        content = content.replace(
          /---\n\n/,
          `heroImage: "${imagePath}"\n---\n\n`
        );
      }

      fs.writeFileSync(mdxPath, content, 'utf-8');
    }

    // Update schedule with image info
    const schedule = JSON.parse(fs.readFileSync(SCHEDULE_PATH, 'utf-8'));
    if (!schedule.posts) schedule.posts = {};
    if (!schedule.posts[day]) schedule.posts[day] = {};
    schedule.posts[day].heroImage = imagePath;
    schedule.posts[day].imageUploadedAt = new Date().toISOString();
    fs.writeFileSync(SCHEDULE_PATH, JSON.stringify(schedule, null, 2), 'utf-8');

    // Get file size info
    const stats = fs.statSync(outputPath);
    const sizeKB = Math.round(stats.size / 1024);

    return new Response(JSON.stringify({
      success: true,
      day,
      slug,
      imagePath,
      dimensions: `${HERO_WIDTH}x${HERO_HEIGHT}`,
      sizeKB,
    }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

export const prerender = false;

import type { APIRoute } from 'astro';
import fs from 'fs';
import path from 'path';

const SCHEDULE_PATH = path.resolve('content-engine/schedule.json');

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { day, note } = body;

    if (!day || typeof day !== 'number') {
      return new Response(JSON.stringify({ error: 'Missing or invalid day' }), { status: 400 });
    }

    // Load schedule
    const schedule = JSON.parse(fs.readFileSync(SCHEDULE_PATH, 'utf-8'));
    if (!schedule.posts) schedule.posts = {};
    if (!schedule.posts[day]) schedule.posts[day] = {};

    // Save note
    schedule.posts[day].editorialNote = note || '';
    schedule.posts[day].noteUpdatedAt = new Date().toISOString();

    fs.writeFileSync(SCHEDULE_PATH, JSON.stringify(schedule, null, 2), 'utf-8');

    return new Response(JSON.stringify({ success: true, day, note }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

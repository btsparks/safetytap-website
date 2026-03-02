export const prerender = false;

import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { SAFETYTAP_SYSTEM_PROMPT } from '../../lib/system-prompt';

const MAX_BASE64_SIZE = 7_000_000; // ~5MB file ≈ ~6.7MB base64

const ALLOWED_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { image, mediaType, caption } = body as {
      image?: string;
      mediaType?: string;
      caption?: string;
    };

    if (!image || !mediaType) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields.' }),
        { status: 400 }
      );
    }

    if (!ALLOWED_MEDIA_TYPES.includes(mediaType as AllowedMediaType)) {
      return new Response(
        JSON.stringify({ error: 'Unsupported image format. Use JPEG, PNG, GIF, or WebP.' }),
        { status: 400 }
      );
    }

    if (image.length > MAX_BASE64_SIZE) {
      return new Response(
        JSON.stringify({ error: 'Image is too large. Please use a photo under 5MB.' }),
        { status: 400 }
      );
    }

    const client = new Anthropic();

    const content: Anthropic.Messages.ContentBlockParam[] = [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType as AllowedMediaType,
          data: image,
        },
      },
    ];

    if (caption && caption.trim()) {
      content.push({
        type: 'text',
        text: caption.trim(),
      });
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 150,
      system: SAFETYTAP_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    const observation = textBlock ? textBlock.text : '';

    return new Response(JSON.stringify({ observation }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Observe API error:', err?.message || err);
    const debugMsg = process.env.NODE_ENV !== 'production'
      ? err?.message || String(err)
      : 'Something went wrong. Please try again.';
    return new Response(
      JSON.stringify({ error: debugMsg, _debug: err?.message }),
      { status: 500 }
    );
  }
};

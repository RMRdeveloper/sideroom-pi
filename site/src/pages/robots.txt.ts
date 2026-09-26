import type { APIRoute } from 'astro';
import { renderRobots } from '../lib/crawl.ts';
import { absoluteUrl } from '../lib/urls.ts';

export const GET: APIRoute = (): Response =>
  new Response(renderRobots(absoluteUrl('/sitemap.xml')), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });

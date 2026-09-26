import type { APIRoute } from 'astro';
import { renderSitemap, sitemapEntries } from '../lib/crawl.ts';
import { absoluteUrl } from '../lib/urls.ts';

export const GET: APIRoute = (): Response =>
  new Response(renderSitemap(sitemapEntries(absoluteUrl)), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });

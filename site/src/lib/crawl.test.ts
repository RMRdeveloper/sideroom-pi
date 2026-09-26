import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderRobots, renderSitemap, sitemapEntries } from './crawl.ts';

const PREFIX = 'https://example.test/base';

function fakeAbsoluteUrl(sitePath: string): string {
  return `${PREFIX}${sitePath}`;
}

test('lists every page in both languages', () => {
  const entries = sitemapEntries(fakeAbsoluteUrl);

  assert.deepEqual(
    entries.map((entry) => entry.loc),
    [
      `${PREFIX}/`,
      `${PREFIX}/es/`,
      `${PREFIX}/policy/`,
      `${PREFIX}/es/politica/`,
    ],
  );
});

test('each entry links to every translation of its page', () => {
  const entries = sitemapEntries(fakeAbsoluteUrl);

  for (const entry of entries) {
    assert.deepEqual(
      entry.alternates.map((link) => link.hreflang),
      ['en', 'es', 'x-default'],
    );
  }
});

test('renders every location and alternate into the sitemap document', () => {
  const sitemap = renderSitemap(sitemapEntries(fakeAbsoluteUrl));

  assert.match(sitemap, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(sitemap, new RegExp(`<loc>${PREFIX}/es/politica/</loc>`));
  assert.equal([...sitemap.matchAll(/<url>/g)].length, 4);
  assert.equal([...sitemap.matchAll(/<xhtml:link /g)].length, 12);
  assert.match(sitemap, /<\/urlset>\n$/);
});

test('points robots at the sitemap it was given', () => {
  const robots = renderRobots(`${PREFIX}/sitemap.xml`);

  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, new RegExp(`^Sitemap: ${PREFIX}/sitemap\\.xml$`, 'm'));
});

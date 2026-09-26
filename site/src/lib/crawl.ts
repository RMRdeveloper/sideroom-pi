import { DEFAULT_LANGUAGE_TAG, LOCALES, type Locale } from '../i18n/index.ts';

// Every indexable page, as its two language variants. src/pages holds the
// routes; this list has to follow them.
export const SITE_PAGES: ReadonlyArray<Record<Locale, string>> = [
  { en: '/', es: '/es/' },
  { en: '/policy/', es: '/es/politica/' },
];

export interface AlternateLink {
  readonly hreflang: string;
  readonly href: string;
}

export interface SitemapEntry {
  readonly loc: string;
  readonly alternates: ReadonlyArray<AlternateLink>;
}

// One entry per page and language, each carrying the links that tell a crawler
// these are translations of one another.
export function sitemapEntries(
  toAbsoluteUrl: (sitePath: string) => string,
): ReadonlyArray<SitemapEntry> {
  return SITE_PAGES.flatMap((page) => {
    const alternateLinks: AlternateLink[] = [
      ...LOCALES.map((locale) => ({
        hreflang: locale,
        href: toAbsoluteUrl(page[locale]),
      })),
      { hreflang: DEFAULT_LANGUAGE_TAG, href: toAbsoluteUrl(page.en) },
    ];
    return LOCALES.map((locale) => ({
      loc: toAbsoluteUrl(page[locale]),
      alternates: alternateLinks,
    }));
  });
}

export function renderSitemap(entries: ReadonlyArray<SitemapEntry>): string {
  const urlElements = entries.map((entry) => {
    const alternateLines = entry.alternates
      .map(
        (link) =>
          `    <xhtml:link rel="alternate" hreflang="${link.hreflang}" href="${link.href}" />`,
      )
      .join('\n');
    return `  <url>\n    <loc>${entry.loc}</loc>\n${alternateLines}\n  </url>`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urlElements,
    '</urlset>',
    '',
  ].join('\n');
}

export function renderRobots(sitemapUrl: string): string {
  return ['User-agent: *', 'Allow: /', `Sitemap: ${sitemapUrl}`, ''].join('\n');
}

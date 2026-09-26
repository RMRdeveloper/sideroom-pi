// Every address the site names or points at, written once so a page can never
// drift from the footer.

// The site is served from a base path, set in astro.config.mjs. Local addresses
// are built from that origin and base instead of being written out by hand, so
// a move to a custom domain is a config change and nothing else.
const configuredOrigin: string = import.meta.env.SITE;
const configuredBase = import.meta.env.BASE_URL;

// Astro hands the base back exactly as it was configured, so the trailing slash
// is added once here and every address below is built by appending to it.
const basePath = configuredBase.endsWith('/')
  ? configuredBase
  : `${configuredBase}/`;

function siteAddress(sitePath: string): URL {
  return new URL(`${basePath}${sitePath.replace(/^\//, '')}`, configuredOrigin);
}

// The full address for a canonical link, an og:url or a sitemap entry.
export function absoluteUrl(sitePath: string): string {
  return siteAddress(sitePath).toString();
}

// The path for an href in the markup, base prefix included.
export function withBase(sitePath: string): string {
  return siteAddress(sitePath).pathname;
}

export const REPO_URL = 'https://github.com/RMRdeveloper/sideroom-pi';
export const NPM_URL =
  'https://www.npmjs.com/package/@rmrdeveloper/sideroom-pi';
export const CHANGELOG_URL = `${REPO_URL}/blob/main/CHANGELOG.md`;
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;
export const ISSUES_URL = `${REPO_URL}/issues`;
export const SECURITY_URL = `${REPO_URL}/blob/main/SECURITY.md`;

// The one service the package talks to, and only when Jev has a key.
export const TYPESAFE_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

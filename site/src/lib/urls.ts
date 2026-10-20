
const configuredOrigin: string = import.meta.env.SITE;
const configuredBase = import.meta.env.BASE_URL;

const basePath = configuredBase.endsWith('/')
  ? configuredBase
  : `${configuredBase}/`;

function siteAddress(sitePath: string): URL {
  return new URL(`${basePath}${sitePath.replace(/^\//, '')}`, configuredOrigin);
}

export function absoluteUrl(sitePath: string): string {
  return siteAddress(sitePath).toString();
}

export function withBase(sitePath: string): string {
  return siteAddress(sitePath).pathname;
}

export const REPO_URL = 'https://github.com/RMRdeveloper/sideroom-pi';
export const NPM_URL =
  'https://www.npmjs.com/package/@rmrdeveloper/sideroom-pi';
export const CHANGELOG_URL = `${REPO_URL}/blob/main/CHANGELOG.md`;
export const BROWSER_DOWNLOAD_URL = `${REPO_URL}/releases/latest/download/sideroom-browser-extension.zip`;
export const BROWSER_GUIDE_URL = `${REPO_URL}/blob/main/docs/extensions/visual-context.md`;
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;
export const ISSUES_URL = `${REPO_URL}/issues`;
export const SECURITY_URL = `${REPO_URL}/blob/main/SECURITY.md`;

export const TYPESAFE_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

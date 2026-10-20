import packageManifest from '../../../package.json';
import { copyFor, type Locale, localeHome } from '../i18n/index.ts';
import { absoluteUrl, LICENSE_URL, NPM_URL, REPO_URL } from './urls.ts';

export function softwareApplicationSchema(
  locale: Locale,
): Record<string, unknown> {
  const copy = copyFor(locale);
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: copy.masthead.name,
    description: copy.meta.homeDescription,
    url: absoluteUrl(localeHome(locale)),
    inLanguage: locale,
    applicationCategory: 'DeveloperApplication',
    softwareVersion: packageManifest.version,
    license: LICENSE_URL,
    installUrl: NPM_URL,
    sameAs: [NPM_URL, REPO_URL],
    author: { '@type': 'Organization', name: 'RMRdeveloper', url: REPO_URL },
  };
}

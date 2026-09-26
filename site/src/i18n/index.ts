import { en } from './en.ts';
import { es } from './es.ts';

export const LOCALES = ['en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

// The language tag that tells a crawler which page to serve when the visitor's
// language matches none of them.
export const DEFAULT_LANGUAGE_TAG = 'x-default';

export type Copy = typeof en;

const dictionaries = { en, es } satisfies Record<Locale, Copy>;
const homePaths = { en: '/', es: '/es/' } satisfies Record<Locale, string>;

export function copyFor(locale: Locale): Copy {
  return dictionaries[locale];
}

export function localeHome(locale: Locale): string {
  return homePaths[locale];
}

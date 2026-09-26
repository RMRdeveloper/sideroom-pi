// The languages the rules know. The name, the extensions and the mark are the
// same in both languages of the site, so they live here instead of in the two
// dictionaries. Every mark but Java comes from simple-icons; simple-icons
// carries no Java mark, so that one comes from the Material Design set.

interface SupportedLanguage {
  readonly name: string;
  readonly extensions: string;
  readonly icon: string;
}

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  {
    name: 'TypeScript',
    extensions: '.ts, .tsx',
    icon: 'simple-icons:typescript',
  },
  {
    name: 'JavaScript',
    extensions: '.js, .jsx, .mjs, .cjs',
    icon: 'simple-icons:javascript',
  },
  { name: 'Go', extensions: '.go', icon: 'simple-icons:go' },
  { name: 'Java', extensions: '.java', icon: 'mdi:language-java' },
  { name: 'PHP', extensions: '.php', icon: 'simple-icons:php' },
  { name: 'Python', extensions: '.py', icon: 'simple-icons:python' },
  { name: 'Rust', extensions: '.rs', icon: 'simple-icons:rust' },
];

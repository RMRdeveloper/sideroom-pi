import { defineConfig } from 'astro/config';
import icon from 'astro-icon';

// GitHub Pages serves a project repository under a base path, so the origin and
// that path are stated once here. src/lib/urls.ts derives every absolute
// address from them, which keeps canonical links, hreflang and the sitemap in
// step with how the site is actually served.
export default defineConfig({
  site: 'https://rmrdeveloper.github.io',
  base: '/sideroom-pi',
  integrations: [
    // No include list: the site is static, so only the icons a page renders reach
    // the HTML, and the icon names live once, in src/lib/languages.ts.
    icon(),
  ],
  build: {
    inlineStylesheets: 'auto',
  },
  devToolbar: {
    enabled: false,
  },
});

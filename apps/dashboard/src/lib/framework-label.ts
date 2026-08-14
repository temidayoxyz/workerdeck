import type { Framework } from '@workerdeck/contracts';

const labels: Record<Framework, string> = {
  static: 'Static HTML',
  vite: 'Vite',
  hono: 'Hono',
  astro: 'Astro',
  next: 'Next.js',
  sveltekit: 'SvelteKit',
  remix: 'Remix',
  nuxt: 'Nuxt',
  qwik: 'Qwik City',
  nitro: 'Nitro',
  'react-router': 'React Router',
  analog: 'Analog',
  docusaurus: 'Docusaurus',
  vitepress: 'VitePress',
  gatsby: 'Gatsby',
  python: 'Python',
  unknown: 'Unknown',
};

export function frameworkLabel(framework: Framework): string {
  return labels[framework];
}

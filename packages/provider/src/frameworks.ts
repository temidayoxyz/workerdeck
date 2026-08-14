import type { FrameworkDetection, FrameworkDetectionInput } from './types';

const hasDependency = (input: FrameworkDetectionInput, dependency: string): boolean => {
  const { dependencies = {}, devDependencies = {} } = input.packageJson ?? {};
  return dependency in dependencies || dependency in devDependencies;
};

const hasFile = (input: FrameworkDetectionInput, pattern: RegExp): boolean =>
  input.files.some((file) => pattern.test(file));

const packageManager = (input: FrameworkDetectionInput): FrameworkDetection['packageManager'] => {
  if (hasFile(input, /(^|\/)pnpm-lock\.yaml$/)) return 'pnpm';
  if (hasFile(input, /(^|\/)yarn\.lock$/)) return 'yarn';
  if (hasFile(input, /(^|\/)bun\.lockb?$/)) return 'bun';
  if (hasFile(input, /(^|\/)package-lock\.json$/) || input.packageJson) return 'npm';
  return 'none';
};

const packageRun = (manager: FrameworkDetection['packageManager'], script: string): string => {
  if (manager === 'pnpm') return `pnpm run ${script}`;
  if (manager === 'yarn') return `yarn ${script}`;
  if (manager === 'bun') return `bun run ${script}`;
  return `npm run ${script}`;
};

const wrangler = (manager: FrameworkDetection['packageManager']): string => {
  if (manager === 'pnpm') return 'pnpm exec wrangler';
  if (manager === 'yarn') return 'yarn wrangler';
  if (manager === 'bun') return 'bunx wrangler';
  return 'npx wrangler';
};

const noBuildStep = 'echo "No build step required"';

export function detectFramework(input: FrameworkDetectionInput): FrameworkDetection {
  const manager = packageManager(input);
  const buildScript = input.packageJson?.scripts?.build;
  const buildCommand = buildScript ? packageRun(manager, 'build') : '';
  const deployCommand = `${wrangler(manager)} deploy`;
  const hasWranglerConfig = hasFile(input, /(^|\/)wrangler\.(?:jsonc?|toml)$/);

  if (hasDependency(input, 'next')) {
    const ready = Boolean(buildScript || hasWranglerConfig);
    return {
      framework: 'next',
      displayName: 'Next.js',
      confidence: 'high',
      evidence: ['Found the `next` package.'],
      buildCommand: buildCommand || noBuildStep,
      outputDirectory: '.open-next',
      runtime: 'worker',
      deployCommand,
      packageManager: manager,
      ready,
      warnings: [
        ...(!ready
          ? ['Add a build script or Wrangler configuration before the first deployment.']
          : []),
        ...(!hasWranglerConfig
          ? [
              'Wrangler automatic configuration may add the Cloudflare adapter and open a setup pull request.',
            ]
          : []),
      ],
    };
  }

  if (hasDependency(input, 'astro')) {
    const ready = Boolean(buildScript);
    return {
      framework: 'astro',
      displayName: 'Astro',
      confidence: 'high',
      evidence: ['Found the `astro` package.'],
      buildCommand: buildCommand || noBuildStep,
      outputDirectory: 'dist',
      runtime: 'worker',
      deployCommand,
      packageManager: manager,
      ready,
      warnings: [
        ...(!ready ? ['Add an Astro build script before the first deployment.'] : []),
        ...(!hasWranglerConfig
          ? [
              'Wrangler automatic configuration may add the Cloudflare adapter and open a setup pull request.',
            ]
          : []),
      ],
    };
  }

  if (hasDependency(input, 'hono')) {
    const ready = hasWranglerConfig;
    return {
      framework: 'hono',
      displayName: 'Hono',
      confidence: 'high',
      evidence: ['Found the `hono` package.'],
      buildCommand: buildCommand || noBuildStep,
      outputDirectory: null,
      runtime: 'worker',
      deployCommand,
      packageManager: manager,
      ready,
      warnings: ready ? [] : ['Add a Wrangler configuration with the Worker entry point.'],
    };
  }

  const viteFramework = detectViteFramework(input);
  if (hasDependency(input, 'vite') || hasFile(input, /(^|\/)vite\.config\.(?:[cm]?[jt]s)$/)) {
    const ready = Boolean(buildScript);
    return {
      framework: 'vite',
      displayName: viteFramework,
      confidence: 'high',
      evidence: ['Found a Vite dependency or configuration file.'],
      buildCommand: buildCommand || noBuildStep,
      outputDirectory: 'dist',
      runtime: 'static',
      deployCommand,
      packageManager: manager,
      ready,
      warnings: [
        ...(!ready ? ['Add a Vite build script before the first deployment.'] : []),
        ...(!hasWranglerConfig
          ? ['Wrangler automatic configuration will generate the Workers assets configuration.']
          : []),
      ],
    };
  }

  if (input.files.some((file) => file === 'index.html' || file.endsWith('/index.html'))) {
    return {
      framework: 'static',
      displayName: 'Static HTML',
      confidence: 'medium',
      evidence: ['Found an HTML entry point without a recognized application framework.'],
      buildCommand: noBuildStep,
      outputDirectory: '.',
      runtime: 'static',
      deployCommand: `${wrangler(manager)} deploy --assets .`,
      packageManager: manager,
      ready: true,
      warnings: [],
    };
  }

  return {
    framework: 'unknown',
    displayName: 'Unknown framework',
    confidence: 'low',
    evidence: ['No supported framework signature was found.'],
    buildCommand: 'npm run build',
    outputDirectory: null,
    runtime: 'worker',
    deployCommand: `${wrangler(manager)} deploy`,
    packageManager: manager,
    ready: false,
    warnings: [
      'WorkerDeck could not identify a supported Cloudflare deployment shape.',
      'Review the build and deploy commands below, and set the output directory for static sites before deploying.',
    ],
  };
}

function detectViteFramework(input: FrameworkDetectionInput): string {
  if (hasDependency(input, '@remix-run/react') || hasDependency(input, 'react-router')) {
    return 'React Router';
  }
  if (hasDependency(input, '@tanstack/react-start')) return 'TanStack Start';
  if (hasDependency(input, '@vitejs/plugin-react') || hasDependency(input, 'react')) {
    return 'React + Vite';
  }
  if (hasDependency(input, '@vitejs/plugin-vue') || hasDependency(input, 'vue')) {
    return 'Vue + Vite';
  }
  if (hasDependency(input, '@sveltejs/vite-plugin-svelte') || hasDependency(input, 'svelte')) {
    return 'Svelte + Vite';
  }
  if (hasDependency(input, 'solid-js')) return 'Solid + Vite';
  return 'Vite';
}

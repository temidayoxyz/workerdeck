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

interface FrameworkSpec {
  framework: FrameworkDetection['framework'];
  displayName: string;
  evidence: string[];
  buildCommand: string;
  outputDirectory: string | null;
  runtime: 'worker' | 'static';
  ready: boolean;
  warnings: string[];
}

function adapterWorkerSpec(
  input: FrameworkDetectionInput,
  manager: FrameworkDetection['packageManager'],
  spec: Omit<FrameworkSpec, 'buildCommand' | 'outputDirectory' | 'runtime' | 'ready' | 'warnings'>,
): FrameworkSpec {
  const buildScript = input.packageJson?.scripts?.build;
  const hasWranglerConfig = hasFile(input, /(^|\/)wrangler\.(?:jsonc?|toml)$/);
  return {
    ...spec,
    buildCommand: buildScript ? packageRun(manager, 'build') : noBuildStep,
    outputDirectory: null,
    runtime: 'worker',
    ready: Boolean(buildScript),
    warnings: [
      ...(!buildScript
        ? [`Add a ${spec.displayName} build script before the first deployment.`]
        : []),
      ...(!hasWranglerConfig
        ? [
            'The Cloudflare adapter should generate a Wrangler configuration during the first build.',
          ]
        : []),
    ],
  };
}

export function detectFramework(input: FrameworkDetectionInput): FrameworkDetection {
  const manager = packageManager(input);
  const buildScript = input.packageJson?.scripts?.build;
  const deployCommand = `${wrangler(manager)} deploy`;
  const hasWranglerConfig = hasFile(input, /(^|\/)wrangler\.(?:jsonc?|toml)$/);

  if (hasDependency(input, 'next')) {
    const ready = Boolean(buildScript || hasWranglerConfig);
    return {
      framework: 'next',
      displayName: 'Next.js',
      confidence: 'high',
      evidence: ['Found the `next` package.'],
      buildCommand: buildScript ? packageRun(manager, 'build') : noBuildStep,
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

  if (hasDependency(input, 'nuxt') || hasDependency(input, '@nuxt/kit')) {
    const spec = adapterWorkerSpec(input, manager, {
      framework: 'nuxt',
      displayName: 'Nuxt',
      evidence: ['Found a Nuxt dependency.'],
    });
    return { ...spec, confidence: 'high', deployCommand, packageManager: manager };
  }

  if (hasDependency(input, '@sveltejs/kit')) {
    const spec = adapterWorkerSpec(input, manager, {
      framework: 'sveltekit',
      displayName: 'SvelteKit',
      evidence: ['Found @sveltejs/kit.'],
    });
    return { ...spec, confidence: 'high', deployCommand, packageManager: manager };
  }

  if (hasDependency(input, '@remix-run/dev')) {
    const spec = adapterWorkerSpec(input, manager, {
      framework: 'remix',
      displayName: 'Remix',
      evidence: ['Found @remix-run/dev.'],
    });
    return { ...spec, confidence: 'high', deployCommand, packageManager: manager };
  }

  if (hasDependency(input, '@builder.io/qwik') || hasDependency(input, '@builder.io/qwik-city')) {
    const spec = adapterWorkerSpec(input, manager, {
      framework: 'qwik',
      displayName: 'Qwik City',
      evidence: ['Found Qwik and Qwik City dependencies.'],
    });
    return { ...spec, confidence: 'high', deployCommand, packageManager: manager };
  }

  if (
    hasDependency(input, '@react-router/dev') ||
    hasFile(input, /(^|\/)react-router\.config\.(?:[cm]?[jt]s)$/)
  ) {
    const spec = adapterWorkerSpec(input, manager, {
      framework: 'react-router',
      displayName: 'React Router',
      evidence: ['Found the React Router framework configuration.'],
    });
    return { ...spec, confidence: 'high', deployCommand, packageManager: manager };
  }

  if (hasDependency(input, '@analogjs/platform')) {
    const spec = adapterWorkerSpec(input, manager, {
      framework: 'analog',
      displayName: 'Analog',
      evidence: ['Found the Analog Angular metaframework.'],
    });
    return { ...spec, confidence: 'high', deployCommand, packageManager: manager };
  }

  if (hasDependency(input, 'nitropack') || hasDependency(input, 'nitro')) {
    const spec = adapterWorkerSpec(input, manager, {
      framework: 'nitro',
      displayName: 'Nitro',
      evidence: ['Found the Nitro server toolkit.'],
    });
    return { ...spec, confidence: 'high', deployCommand, packageManager: manager };
  }

  if (hasDependency(input, 'astro')) {
    const ready = Boolean(buildScript);
    return {
      framework: 'astro',
      displayName: 'Astro',
      confidence: 'high',
      evidence: ['Found the `astro` package.'],
      buildCommand: buildScript ? packageRun(manager, 'build') : noBuildStep,
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

  if (hasDependency(input, '@docusaurus/core')) {
    const ready = Boolean(buildScript);
    return {
      framework: 'docusaurus',
      displayName: 'Docusaurus',
      confidence: 'high',
      evidence: ['Found @docusaurus/core.'],
      buildCommand: buildScript ? packageRun(manager, 'build') : noBuildStep,
      outputDirectory: 'build',
      runtime: 'static',
      deployCommand,
      packageManager: manager,
      ready,
      warnings: !ready ? ['Add a Docusaurus build script before the first deployment.'] : [],
    };
  }

  if (hasDependency(input, 'vitepress')) {
    const docsBuildScript = input.packageJson?.scripts?.['docs:build'];
    const ready = Boolean(buildScript || docsBuildScript);
    return {
      framework: 'vitepress',
      displayName: 'VitePress',
      confidence: 'high',
      evidence: ['Found the VitePress dependency.'],
      buildCommand: docsBuildScript
        ? packageRun(manager, 'docs:build')
        : buildScript
          ? packageRun(manager, 'build')
          : noBuildStep,
      outputDirectory: '.vitepress/dist',
      runtime: 'static',
      deployCommand,
      packageManager: manager,
      ready,
      warnings: !ready ? ['Add a VitePress build script before the first deployment.'] : [],
    };
  }

  if (hasDependency(input, 'gatsby')) {
    const ready = Boolean(buildScript);
    return {
      framework: 'gatsby',
      displayName: 'Gatsby',
      confidence: 'high',
      evidence: ['Found the Gatsby dependency.'],
      buildCommand: buildScript ? packageRun(manager, 'build') : noBuildStep,
      outputDirectory: 'public',
      runtime: 'static',
      deployCommand,
      packageManager: manager,
      ready,
      warnings: !ready ? ['Add a Gatsby build script before the first deployment.'] : [],
    };
  }

  if (hasDependency(input, 'hono')) {
    const ready = hasWranglerConfig;
    return {
      framework: 'hono',
      displayName: 'Hono',
      confidence: 'high',
      evidence: ['Found the `hono` package.'],
      buildCommand: buildScript ? packageRun(manager, 'build') : noBuildStep,
      outputDirectory: null,
      runtime: 'worker',
      deployCommand,
      packageManager: manager,
      ready,
      warnings: ready ? [] : ['Add a Wrangler configuration with the Worker entry point.'],
    };
  }

  const hasPythonEntry = hasFile(input, /(^|\/)(?:main|entry)\.py$/);
  const hasRequirements = hasFile(input, /(^|\/)requirements\.txt$/);
  if (hasPythonEntry || hasRequirements) {
    const ready = Boolean(hasWranglerConfig || hasPythonEntry);
    return {
      framework: 'python',
      displayName: 'Python',
      confidence: 'medium',
      evidence: ['Found a Python entry point or requirements.txt.'],
      buildCommand: hasRequirements ? 'pip install -r requirements.txt' : noBuildStep,
      outputDirectory: null,
      runtime: 'worker',
      deployCommand,
      packageManager: manager,
      ready,
      warnings: ready
        ? []
        : ['Add a Wrangler configuration with the Python entry point before deploying.'],
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
      buildCommand: buildScript ? packageRun(manager, 'build') : noBuildStep,
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

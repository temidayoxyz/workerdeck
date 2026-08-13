import type { FrameworkDetection, FrameworkDetectionInput } from './types';

const hasDependency = (input: FrameworkDetectionInput, dependency: string): boolean => {
  const { dependencies = {}, devDependencies = {} } = input.packageJson ?? {};
  return dependency in dependencies || dependency in devDependencies;
};

export function detectFramework(input: FrameworkDetectionInput): FrameworkDetection {
  if (hasDependency(input, 'next')) {
    return {
      framework: 'next',
      confidence: 'high',
      evidence: ['Found the `next` package.'],
      buildCommand: 'npm run build',
      outputDirectory: '.open-next',
      runtime: 'worker',
    };
  }

  if (hasDependency(input, 'astro')) {
    return {
      framework: 'astro',
      confidence: 'high',
      evidence: ['Found the `astro` package.'],
      buildCommand: 'npm run build',
      outputDirectory: 'dist',
      runtime: 'worker',
    };
  }

  if (hasDependency(input, 'hono')) {
    return {
      framework: 'hono',
      confidence: 'high',
      evidence: ['Found the `hono` package.'],
      buildCommand: 'npm run build',
      outputDirectory: null,
      runtime: 'worker',
    };
  }

  if (hasDependency(input, 'vite') || input.files.includes('vite.config.ts')) {
    return {
      framework: 'vite',
      confidence: 'high',
      evidence: ['Found a Vite dependency or configuration file.'],
      buildCommand: 'npm run build',
      outputDirectory: 'dist',
      runtime: 'static',
    };
  }

  if (input.files.some((file) => file === 'index.html' || file.endsWith('/index.html'))) {
    return {
      framework: 'static',
      confidence: 'medium',
      evidence: ['Found an HTML entry point without a recognized application framework.'],
      buildCommand: '',
      outputDirectory: '.',
      runtime: 'static',
    };
  }

  return {
    framework: 'unknown',
    confidence: 'low',
    evidence: ['No supported framework signature was found.'],
    buildCommand: 'npm run build',
    outputDirectory: null,
    runtime: 'worker',
  };
}

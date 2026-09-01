export interface BuildDiagnosis {
  code: string;
  title: string;
  remediation: string;
}

interface DiagnosisRule {
  code: string;
  title: string;
  remediation: string;
  matches: RegExp;
}

const rules: DiagnosisRule[] = [
  {
    code: 'VITE_RUNNER_CONFIG_INCOMPATIBLE',
    title: 'The legacy Vite runner config loader is incompatible with this repository.',
    remediation:
      "WorkerDeck now restores Vite's default bundled config loader. Redeploy after the build trigger is reconciled.",
    matches: /Executing user build command:.*--configLoader(?:=|\s+)runner/i,
  },
  {
    code: 'VITE_ESM_DIRNAME',
    title: 'The Vite config uses __dirname, which is unavailable under ESM config loading.',
    remediation:
      "In vite.config.ts, replace __dirname with import.meta.dirname, or add const __dirname = fileURLToPath(new URL('.', import.meta.url)) after importing fileURLToPath from node:url.",
    matches: /(?:__dirname is not defined|ReferenceError:\s*__dirname)/i,
  },
  {
    code: 'VITE_CONFIG_LOAD_FAILED',
    title: 'Vite could not load vite.config.ts.',
    remediation: 'Open vite.config.ts and fix the syntax or invalid import, then push and rebuild.',
    matches: /failed to load config from/i,
  },
  {
    code: 'DEPENDENCY_INSTALL_FAILED',
    title: 'Dependency installation failed before the build could start.',
    remediation:
      'Check package.json and the lockfile for invalid versions, then push a corrected lockfile.',
    matches: /npm ERR!|error code E[A-Z0-9]+|Could not resolve/i,
  },
  {
    code: 'TYPESCRIPT_ERROR',
    title: 'TypeScript compilation failed.',
    remediation:
      'Fix the TypeScript errors shown in the log (each starts with error TS####), then push and rebuild.',
    matches: /error TS\d+:/i,
  },
  {
    code: 'MODULE_NOT_FOUND',
    title: 'A required module is missing from the build.',
    remediation:
      'Add the missing dependency to package.json or fix the import path, then push and rebuild.',
    matches: /Cannot find module|ERR_MODULE_NOT_FOUND|Cannot find package/i,
  },
  {
    code: 'BUILD_SCRIPT_MISSING',
    title: 'The build script declared for this project does not exist.',
    remediation:
      'Add a matching build script to package.json or correct the build command in project settings.',
    matches: /Missing script:\s*["']build["']/i,
  },
  {
    code: 'OUT_OF_MEMORY',
    title: 'The build ran out of memory.',
    remediation:
      'Reduce the bundle size, split large dependencies, or remove a memory-hungry build step, then push and rebuild.',
    matches: /JavaScript heap out of memory|FATAL ERROR:.*(?:heap|allocation)/i,
  },
];

export function diagnoseBuildFailure(lines: string[]): BuildDiagnosis | null {
  for (const rule of rules) {
    if (lines.some((line) => rule.matches.test(line))) {
      return { code: rule.code, title: rule.title, remediation: rule.remediation };
    }
  }
  return null;
}

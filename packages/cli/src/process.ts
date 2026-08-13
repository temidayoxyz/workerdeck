import { spawn } from 'node:child_process';

interface RunOptions {
  env?: NodeJS.ProcessEnv;
  input?: string;
}

export function run(
  command: string,
  args: string[],
  cwd: string,
  options: RunOptions = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...options.env },
      stdio: options.input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
      shell: false,
    });

    if (options.input !== undefined) child.stdin?.end(`${options.input}\n`);
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `${command} exited with ${signal ? `signal ${signal}` : `code ${String(code)}`}.`,
          ),
        );
    });
  });
}

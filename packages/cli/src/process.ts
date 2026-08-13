import { spawn } from 'node:child_process';

export function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', shell: false });
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

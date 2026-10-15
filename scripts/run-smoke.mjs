/** Keep browser failures readable through GitHub check annotations as well as logs. */
import { spawn } from 'node:child_process';
const script = process.argv[2];
if (!/^smoke(?::[a-z-]+)?$/.test(script ?? '')) throw new Error('Expected a smoke npm script');
const escapeCommand = (s) =>
  s.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
console.log(`Running ${script}`);
let tail = '';
const child = spawn('npm', ['run', script], {
  shell: process.platform === 'win32',
  stdio: ['ignore', 'pipe', 'pipe'],
});
const forward = (destination) => (chunk) => {
  destination.write(chunk);
  tail = (tail + chunk.toString()).slice(-10000);
};
child.stdout.on('data', forward(process.stdout));
child.stderr.on('data', forward(process.stderr));
child.on('error', (error) => {
  tail += `\n${error.message}`;
});
child.on('close', (code, signal) => {
  const result = code ?? 1;
  if (result !== 0 && process.env.GITHUB_ACTIONS === 'true')
    console.log(
      `::error title=${escapeCommand(`${script} failed`)}::${escapeCommand(tail || `Terminated by ${signal}`)}`,
    );
  process.exitCode = result;
});

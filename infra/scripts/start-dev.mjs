import { spawn } from 'node:child_process';
import process from 'node:process';

const profile = process.env.AWS_PROFILE || 'sandbox';
const processes = [];
let shuttingDown = false;

function start(command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
  processes.push(child);
  child.on('exit', (code, signal) => {
    if (!shuttingDown && code !== 0) {
      console.error(`${command} が終了しました（code=${code}, signal=${signal}）`);
      shutdown(code || 1);
    }
  });
  return child;
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of processes) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(exitCode), 300).unref();
}

console.log(`AWS profile: ${profile}`);
console.log('AgentCore: http://127.0.0.1:8081/invocations');
console.log('Web:       http://127.0.0.1:5173');

start('./node_modules/.bin/cdkd', [
  'local', 'start-agentcore', 'PawapoAgent/Runtime',
  '--watch', '--port', '8081', '--no-verify-auth', '--profile', profile,
]);
start('./node_modules/.bin/vite', [], {
  VITE_AGENT_ENDPOINT: '/local-agent',
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

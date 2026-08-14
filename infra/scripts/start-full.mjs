import { spawn } from 'node:child_process';
import process from 'node:process';

const profile = process.env.AWS_PROFILE;
const processes = [];
let shuttingDown = false;

function start(args) {
  const child = spawn('./node_modules/.bin/cdkd', args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  processes.push(child);
  child.on('exit', (code, signal) => {
    if (!shuttingDown && code !== 0) {
      console.error(`cdkd が終了しました（code=${code}, signal=${signal}）`);
      shutdown(code || 1);
    }
  });
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of processes) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(exitCode), 300).unref();
}

console.log(`AWS profile: ${profile || '(default credential chain)'}`);
console.log('AgentCore: http://127.0.0.1:8081/invocations');
console.log('Web:       http://127.0.0.1:8080');

const agentArgs = [
  'local', 'start-agentcore', 'PawapoAgent/Runtime',
  '--watch', '--port', '8081', '--no-verify-auth',
];
const webArgs = [
  'local', 'start-cloudfront', 'PawapoWeb/Distribution',
  '--watch', '--port', '8080', '--from-state',
  '-c', 'localAgentEndpoint=http://127.0.0.1:8081/invocations',
];
if (profile) {
  agentArgs.push('--profile', profile);
  webArgs.push('--profile', profile);
}
start(agentArgs);
start(webArgs);

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

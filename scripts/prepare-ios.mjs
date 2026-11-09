#!/usr/bin/env node
/**
 * Prepare an isolated local iOS workspace without accessing App Store Connect.
 * Run on macOS after installing the matching @capacitor/ios major version.
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const cwd = process.cwd();
const manager = "pnpm";
function run(cmd, args) {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
if (process.platform !== 'darwin') {
  console.error('iOS preparation requires macOS with Xcode. No changes were made.');
  process.exit(1);
}
if (!existsSync(join(cwd, 'node_modules', '@capacitor', 'ios'))) {
  console.error('Missing @capacitor/ios: install the matching major/minor for this app, review lockfile, then retry.');
  process.exit(1);
}

run(manager, ["build:prod"]);
if (!existsSync(join(cwd, "dist"))) {
  console.error('Web build directory not found; iOS generation aborted.');
  process.exit(1);
}
const platformExists = existsSync(join(cwd, 'ios'));
run('npx', ['cap', platformExists ? 'sync' : 'add', 'ios']);
console.log('iOS project prepared locally. Validate signing and iPhone behavior before archiving.');

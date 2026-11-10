import { runTests } from '@vscode/test-electron';
import { resolve } from 'node:path';

await runTests({
  version: '1.145.0',
  vscodeExecutablePath: process.env.VSCODE_EXECUTABLE,
  extensionDevelopmentPath: resolve(process.env.ASON_EXTENSION_PATH ?? '.'),
  extensionTestsPath: resolve(process.env.ASON_TESTS_PATH ?? 'dist/test/suite.cjs'),
  launchArgs: [
    resolve('test/fixtures'),
    '--extensionDevelopmentKind=web',
    '--disable-workspace-trust',
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-extensions',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding'
  ]
});
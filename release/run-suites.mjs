// Runs both offline suites for release-audit. The public-source guard test is
// intentionally skipped here: it requires pwsh + git and is covered by CI and
// by the maintainer's environment. Its status is reported separately.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export function runSuites(repoRoot) {
  function run(workdir, files) {
    try {
      execFileSync(process.execPath, ['--test', ...files], { cwd: workdir, stdio: 'pipe' });
      return { ok: true, pass: null, fail: 0 };
    } catch (error) {
      const out = String(error.stdout || '');
      const passMatch = out.match(/pass (\d+)/);
      const failMatch = out.match(/fail (\d+)/);
      return { ok: false, pass: passMatch ? Number(passMatch[1]) : null, fail: failMatch ? Number(failMatch[1]) : null };
    }
  }
  const extDir = join(repoRoot, 'extension/src');
  const extFiles = readdirSync(join(extDir, 'tests')).filter((f) => f.endsWith('.test.mjs') && f !== 'public-source-guard.test.mjs').map((f) => join(extDir, 'tests', f));
  const wrkDir = join(repoRoot, 'worker/src');
  const wrkFiles = readdirSync(join(wrkDir, 'tests')).filter((f) => f.endsWith('.test.mjs')).map((f) => join(wrkDir, 'tests', f));
  return {
    extension: { ...run(extDir, extFiles), guardSkipped: true, note: 'public-source-guard requires pwsh+git; verified by CI' },
    worker: run(wrkDir, wrkFiles)
  };
}

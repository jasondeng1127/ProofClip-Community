// Records a rehearsal result into the current release record with full
// evidence binding. The recorded sourceCommit must equal the record's commit
// and the artifactSha256 must equal the record's artifact sha (fail-closed;
// use --force to override after an intentional rebind).
// Usage:
//   node release/set-rehearsal.mjs --name freshDeploy|upgrade07To08 --result PASS|FAIL|NOT_RUN //        --executor "<who>" --environment "<what>" --evidence "<path or summary>" //        [--source-commit <sha>] [--artifact-sha <sha>]
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const recordFile = join(HERE, 'records', 'release-record.json');

const args = process.argv.slice(2);
const get = (name) => args.find((a) => a.startsWith('--' + name + '='))?.split('=').slice(1).join('=');
const name = get('name');
const result = get('result');
if (!['freshDeploy', 'upgrade07To08'].includes(name) || !['PASS', 'FAIL', 'NOT_RUN'].includes(result)) {
  console.error('usage: node release/set-rehearsal.mjs --name freshDeploy|upgrade07To08 --result PASS|FAIL|NOT_RUN --executor <who> --environment <what> --evidence <path|summary> [--source-commit <sha>] [--artifact-sha <sha>]');
  process.exit(2);
}

const record = JSON.parse(await readFile(recordFile, 'utf8'));
let sourceCommit = get('source-commit');
if (!sourceCommit) {
  try { sourceCommit = execFileSync('git', ['-C', join(HERE, '..'), 'rev-parse', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { sourceCommit = null; }
}
let artifactSha256 = get('artifact-sha') || record.artifact?.sha256 || null;

if (result === 'PASS') {
  const executor = get('executor');
  const environment = get('environment');
  const evidence = get('evidence');
  if (!executor || !environment || !evidence) {
    console.error('PASS requires --executor, --environment and --evidence.');
    process.exit(2);
  }
  const boundCommit = record.sourceBinding?.commit;
  const force = args.includes('--force');
  if (sourceCommit && boundCommit && sourceCommit !== boundCommit && !force) {
    console.error('sourceCommit ' + sourceCommit.slice(0, 12) + ' != record commit ' + boundCommit.slice(0, 12) + '; the rehearsal must bind the same frozen HEAD (--force to override).');
    process.exit(1);
  }
  if (artifactSha256 && record.artifact?.sha256 && artifactSha256 !== record.artifact.sha256 && !force) {
    console.error('artifactSha256 does not match the record artifact; the rehearsal must bind the same ZIP (--force to override).');
    process.exit(1);
  }
  record.rehearsals = {
    ...(record.rehearsals || {}),
    [name]: { result, executedAt: new Date().toISOString(), executor, environment, evidence, sourceCommit, artifactSha256 }
  };
} else {
  record.rehearsals = { ...(record.rehearsals || {}), [name]: { result, executedAt: new Date().toISOString(), executor: get('executor') || null, environment: get('environment') || null, evidence: get('evidence') || null, sourceCommit, artifactSha256 } };
}
record.updatedAt = new Date().toISOString();
await writeFile(recordFile, JSON.stringify(record, null, 2) + '\n', 'utf8');
console.log('rehearsals now:', JSON.stringify(record.rehearsals, null, 1));

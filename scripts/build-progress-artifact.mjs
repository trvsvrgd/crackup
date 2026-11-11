import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const ledger = JSON.parse(await readFile(path.join(root, 'artifacts/project-progress.json'), 'utf8'));
assert.equal(ledger.schemaVersion, 1);
const ids = new Set(ledger.stages.map(s => s.id));
assert.equal(ids.size, ledger.stages.length, 'Stage IDs must be unique');
for (const stage of ledger.stages) {
  assert.ok(['complete', 'next', 'blocked'].includes(stage.status));
  for (const dependency of stage.dependsOn) {
    assert.ok(ids.has(dependency), `Unknown dependency ${dependency}`);
    if (stage.status !== 'blocked') assert.equal(ledger.stages.find(s => s.id === dependency).status, 'complete', `${stage.id} requires completed ${dependency}`);
  }
}
for (const evidence of ledger.evidence) {
  const bytes = await readFile(path.join(root, evidence.path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.sha256, `Evidence changed: ${evidence.path}`);
}
const safe = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const statuses = { complete: 'Complete / verified', next: 'Next', blocked: 'Waiting for prerequisites' };
const lines = [
  '# CRACKUP project progress ledger', '',
  `Updated: ${ledger.updatedAt}. This is a checkpoint log, not a production-release certificate.`, '',
  `**Resume here:** ${ledger.resume.summary}`, '',
  `Branch: ${ledger.delivery.branch} · Base: ${ledger.delivery.base}`,
  `PR: ${ledger.delivery.prUrl ? `[Open pull request](${ledger.delivery.prUrl})` : 'Will be linked after the branch is pushed.'}`,
  `Approval: ${ledger.delivery.approval.summary}`, '',
  '## Stage map', '',
  'The Phase 1-6 gameplay roadmap and Section 6 art stages use different numbering. The gameplay foundation is verified; the art pipeline remains incomplete.', '',
  '| Section 6 checkpoint | State | Dependencies | Outcome / exit gate |',
  '| --- | --- | --- | --- |',
  ...ledger.stages.map(s => `| ${safe(s.title)} | ${statuses[s.status]} | ${s.dependsOn.join(', ') || 'None'} | ${safe(s.summary)} |`), '',
  '## Resume checklist', '',
  ...ledger.resume.steps.map((s, i) => `${i + 1}. ${s}`), '',
  '## Project foundation', '',
  ...ledger.foundation.map(s => `- **${s.title}:** ${s.summary}`), '',
  '## Verification at this checkpoint', '',
  '| Check | Result | Evidence |', '| --- | --- | --- |',
  ...ledger.verification.map(v => `| ${v.command} | ${safe(v.result)} | ${safe(v.evidence)} |`), '',
  'Browser reports below were produced during the implementation runs. Build, regression and asset validation were rerun for this saving checkpoint.', '',
  '## Decisions and limits', '',
  ...ledger.decisions.map(d => `- ${d}`), '',
  '## Remaining release work', '',
  ...ledger.releaseGates.map(g => `- [ ] ${g}`), '',
  '## Progress log', '',
  '| Date / time (UTC) | Event |', '| --- | --- |',
  ...ledger.log.map(e => `| ${e.at} | ${safe(e.summary)} |`), '',
  '## Saved evidence', '',
  'Files are copied from local QA output; SHA-256 hashes in the JSON ledger bind this checkpoint to these exact artifacts.', '',
  ...ledger.evidence.map(e => `- [${path.basename(e.path)}](./${e.path.replace('artifacts/', '')}) — ${e.kind}`), '',
  '## Maintaining this artifact', '',
  'Edit artifacts/project-progress.json when a checkpoint passes. Append a dated log entry, attach the new evidence, and update the resume checklist. Keep unfinished dependencies blocked.', '',
  'Run npm run progress to rebuild this document and npm run progress:check to validate it. The check validates dependencies, saved-evidence hashes and generated-document consistency. PR approval remains governed by the live GitHub review state.', '',
  'Detailed history: [Section 6 progress](../SECTION6_PROGRESS_REPORT.md), [implementation plan](../SECTION6_IMPLEMENTATION_PLAN.md), [alpha notes](../ALPHA_RELEASE_NOTES.md), [Phase 6 report](../PHASE6_PROGRESS_REPORT.md).', '',
];
const document = lines.join('\n');
if (process.argv.includes('--check')) {
  assert.equal((await readFile(path.join(root, 'artifacts/project-progress.md'), 'utf8')).replaceAll('\r\n', '\n'), document, 'Progress document is stale; run npm run progress');
  console.log(`Progress artifact verified: ${ledger.stages.length} checkpoints, ${ledger.evidence.length} saved evidence files.`);
} else {
  await writeFile(path.join(root, 'artifacts/project-progress.md'), document);
  console.log('Built artifacts/project-progress.md');
}

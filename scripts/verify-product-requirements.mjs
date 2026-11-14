// Structural product-plan checks. Passing does not accept gameplay requirements.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const files = [
  'docs/PRODUCT_REQUIREMENTS_V3.md', 'docs/PRODUCTION_DELIVERY_PLAN.md',
  'docs/PRODUCT_BASELINE_DECISIONS.md', 'docs/OPENING_OPERATION_SPEC.md',
  'artifacts/product-delivery-status.md', 'artifacts/product-baseline-audit.md',
  'artifacts/product-p0-continuation.md', 'artifacts/product-p1-save.md', 'artifacts/product-p1-presentation.md', 'artifacts/product-p1-campaign.md', 'docs/CAMPAIGN_COOP_POLICY.md', 'PRD.md', 'README.md',
];
const errors = [];
const check = (condition, detail) => { if (!condition) errors.push(detail); };
const texts = new Map(files.map(file => [file, fs.readFileSync(file, 'utf8')]));
const rows = text => text.split(/\r?\n/).filter(line => /^\| (?:FR|NFR)-/.test(line))
  .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
const requirements = rows(texts.get(files[0]));
const statuses = rows(texts.get('artifacts/product-delivery-status.md'));
const byId = new Map(requirements.map(row => [row[0], row]));
const statusById = new Map(statuses.map(row => [row[0], row]));
check(byId.size === requirements.length, 'Requirement IDs must be unique');
check(statusById.size === statuses.length, 'Status IDs must be unique');
check(requirements.length === 96, 'Expected 96 baseline requirements; document intentional register changes');
check(statuses.length === requirements.length, 'Requirement and status row counts differ');
for (const row of requirements) {
  const [id, acceptance, evidence, owner, gate] = row;
  check(row.length === 5 && acceptance && evidence && owner && /^P[0-8]$/.test(gate), `${id}: incomplete requirement row`);
  const status = statusById.get(id);
  check(Boolean(status), `${id}: missing status`);
  if (!status) continue;
  check(status.length === 5, `${id}: malformed status row`);
  check(status[1] === owner && status[2] === gate, `${id}: owner/gate differs from PRD`);
  check(['Unverified', 'In progress', 'Needs work', 'Accepted'].includes(status[3]), `${id}: invalid status`);
  if (status[3] !== 'Unverified') check(status[4] && status[4] !== 'Pending', `${id}: status needs evidence or work reference`);
  if (status[3] === 'Accepted') {
    check(/review|owner/i.test(status[4]) && /\]\(/.test(status[4]), `${id}: acceptance needs linked evidence and reviewer`);
  }
}
for (const id of statusById.keys()) check(byId.has(id), `${id}: unknown requirement in status register`);

const localLinks = [], unknownIds = new Set();
for (const [file, text] of texts) {
  for (const match of text.matchAll(/\b(?:FR|NFR)-[A-Z]+-\d{2}\b/g)) {
    if (!byId.has(match[0])) unknownIds.add(match[0]);
  }
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
    const resolved = path.resolve(path.dirname(path.resolve(file)), decodeURIComponent(target));
    const exists = fs.existsSync(resolved);
    localLinks.push({ from: file, target, exists });
    check(exists, `${file}: missing local link ${target}`);
  }
}
check(unknownIds.size === 0, `Unknown requirement references: ${[...unknownIds].join(', ')}`);

const ledger = texts.get('artifacts/product-delivery-status.md');
const gates = ledger.split(/\r?\n/).filter(line => /^\| P[0-8] \|/.test(line))
  .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
check(gates.length === 9 && new Set(gates.map(row => row[0])).size === 9, 'Expected unique P0–P8 gates');
for (let i = 0; i < gates.length; i++) {
  check(gates[i][0] === `P${i}`, `Gate order mismatch at P${i}`);
  check(gates[i][2] === (i === 0 ? 'None' : `P${i - 1}`), `P${i}: predecessor mismatch`);
  if (/^Accepted$/i.test(gates[i][3])) {
    check(i === 0 || /^Accepted$/i.test(gates[i - 1][3]), `P${i}: predecessor not accepted`);
    check(/owner|review/i.test(gates[i][4]) && /\]\(/.test(gates[i][4]), `P${i}: missing review/evidence`);
    for (const status of statuses.filter(row => Number(row[2].slice(1)) <= i)) {
      check(status[3] === 'Accepted', `P${i}: due requirement ${status[0]} remains ${status[3]}`);
    }
  }
}

const opening = texts.get('docs/OPENING_OPERATION_SPEC.md');
const beats = opening.split(/\r?\n/).filter(line => /^\| (arrival|street_lead|customs|roof_transfer|quay_fight|return) \|/.test(line))
  .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
check(beats.length === 6 && new Set(beats.map(row => row[0])).size === 6, 'Opening needs six unique authored beats');
let minMinutes = 0, maxMinutes = 0;
for (let i = 0; i < beats.length; i++) {
  const beat = beats[i], duration = /^(\d+)–(\d+)$/.exec(beat[1]);
  check(Boolean(duration), `${beat[0]}: missing duration range`);
  if (duration) { minMinutes += Number(duration[1]); maxMinutes += Number(duration[2]); }
  check(beat[4]?.includes('CP-'), `${beat[0]}: missing checkpoint/recovery definition`);
  if (i < beats.length - 1) check(beat[2].includes(`continue to ${beats[i + 1][0]}`), `${beat[0]}: broken next-beat reference`);
}
check(minMinutes === 30 && maxMinutes === 45, 'Opening beat budget must total 30–45 minutes');
const scenarios = [...opening.matchAll(/^\| (OPEN-\d{2}) \|/gm)].map(match => match[1]);
check(scenarios.length === 10 && new Set(scenarios).size === 10, 'Opening needs ten unique acceptance scenarios');
const packages = [...opening.matchAll(/^\| (P1-[A-Z]+) \|/gm)].map(match => match[1]);
check(packages.length === 5 && new Set(packages).size === 5, 'Opening needs five unique bounded P1 packages');

const report = {
  schemaVersion: 2, checkedAt: new Date().toISOString(),
  scope: 'Document structure, local links, requirement traceability and authored opening brief only. No gameplay or human acceptance is implied.',
  result: errors.length ? 'failed' : 'passed',
  requirements: { total: requirements.length, functional: requirements.filter(r => r[0].startsWith('FR-')).length,
    nonFunctional: requirements.filter(r => r[0].startsWith('NFR-')).length,
    statuses: Object.fromEntries(['Unverified', 'In progress', 'Needs work', 'Accepted'].map(s => [s, statuses.filter(r => r[3] === s).length])) },
  milestones: { count: gates.length, accepted: gates.filter(row => row[3] === 'Accepted').length },
  opening: { beats: beats.length, plannedMinutes: [minMinutes, maxMinutes], scenarios: scenarios.length, p1Packages: packages.length },
  localLinks: { checked: localLinks.length, missing: localLinks.filter(link => !link.exists) },
  crossReferences: { unknownRequirementIds: [...unknownIds] },
  files: files.map(file => ({ path: file, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') })),
  errors,
};
fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
fs.writeFileSync('artifacts/product-requirements-validation.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ result: report.result, requirements: report.requirements, opening: report.opening, errors }, null, 2));
if (errors.length) process.exitCode = 1;

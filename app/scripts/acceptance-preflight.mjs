import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const outputDir = 'output';
const jsonPath = `${outputDir}/acceptance-preflight.json`;
const markdownPath = `${outputDir}/acceptance-preflight.md`;
const args = new Set(process.argv.slice(2));
const strictGo = args.has('--strict-go');

const LOCAL_STEPS = [
  {
    id: 'artifactVerify',
    label: '产物清单反向校验',
    command: [process.execPath, ['./scripts/artifact-verify.mjs']]
  },
  {
    id: 'releaseEvidenceCheck',
    label: '发布证据包一致性',
    command: [process.execPath, ['./scripts/release-evidence-check.mjs']]
  },
  {
    id: 'readinessCheck',
    label: '生产就绪文档和脚本索引',
    command: [process.execPath, ['./scripts/readiness-check.mjs']]
  },
  {
    id: 'externalEvidenceCheck',
    label: '外部证据格式和安全占位校验',
    command: [process.execPath, ['./scripts/external-evidence-check.mjs']]
  },
  {
    id: 'externalEvidenceWorksheet',
    label: '外部证据负责人填报表刷新',
    command: [process.execPath, ['./scripts/external-evidence-worksheet.mjs']]
  },
  {
    id: 'externalEvidenceCockpit',
    label: '外部证据指挥台刷新',
    command: [process.execPath, ['./scripts/external-evidence-cockpit.mjs']]
  },
  {
    id: 'externalEvidenceRequestPack',
    label: 'Ops/Legal/QA 外部证据请求包刷新',
    command: [process.execPath, ['./scripts/external-evidence-request-pack.mjs']]
  },
  {
    id: 'deployTransferPlan',
    label: '服务器传输计划刷新（只生成本地清单，不上传）',
    command: [process.execPath, ['./scripts/deploy-transfer-plan.mjs']]
  },
  {
    id: 'manualAcceptanceRecord',
    label: '真机验收记录表刷新',
    command: [process.execPath, ['./scripts/manual-acceptance-record.mjs']]
  },
  {
    id: 'acceptanceHandoff',
    label: '10点验收交接包刷新',
    command: [process.execPath, ['./scripts/acceptance-handoff.mjs']]
  },
  {
    id: 'acceptanceBrief',
    label: '10点验收口径一页纸刷新',
    command: [process.execPath, ['./scripts/acceptance-brief.mjs']]
  },
  {
    id: 'acceptanceSignoffSheet',
    label: '10am owner signoff sheet refresh',
    command: [process.execPath, ['./scripts/acceptance-signoff-sheet.mjs']]
  },
  {
    id: 'acceptanceMeetingMinutes',
    label: '10am meeting minutes and action tracker refresh',
    command: [process.execPath, ['./scripts/acceptance-meeting-minutes.mjs']]
  },
  {
    id: 'acceptanceSnapshotLock',
    label: '10am snapshot lock and hash index refresh',
    command: [process.execPath, ['./scripts/acceptance-snapshot-lock.mjs']]
  },
  {
    id: 'acceptanceDecisionCard',
    label: '10am GO/NO_GO decision card refresh',
    command: [process.execPath, ['./scripts/acceptance-decision-card.mjs']]
  }
];

function formatChinaTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} +08:00`;
}

function lastUsefulLine(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(-1)[0] || '';
}

function runStep(step) {
  const startedAt = Date.now();
  const [file, stepArgs] = step.command;
  const result = spawnSync(file, stepArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true
  });
  const durationMs = Date.now() - startedAt;
  return {
    id: step.id,
    label: step.label,
    command: `${file} ${stepArgs.join(' ')}`,
    ok: result.status === 0,
    exitCode: result.status,
    durationMs,
    summary: lastUsefulLine(result.stdout) || lastUsefulLine(result.stderr),
    stdoutTail: String(result.stdout || '').split(/\r?\n/).slice(-12).join('\n').trim(),
    stderrTail: String(result.stderr || '').split(/\r?\n/).slice(-12).join('\n').trim()
  };
}

function runLaunchStatus() {
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, ['./scripts/launch-status.mjs', '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true
  });
  const durationMs = Date.now() - startedAt;
  let parsed = null;
  let parseError = '';
  try {
    parsed = JSON.parse(result.stdout || '{}');
  } catch (error) {
    parseError = error.message;
  }
  return {
    id: 'launchStatus',
    label: '上线状态判定',
    command: `${process.execPath} ./scripts/launch-status.mjs --json`,
    ok: result.status === 0 && parsed && !parseError,
    exitCode: result.status,
    durationMs,
    decision: parsed?.decision || 'UNKNOWN',
    externalVerified: parsed?.external?.verified != null ? parsed.external.verified : null,
    externalTotal: parsed?.external?.total != null ? parsed.external.total : null,
    blockerCount: Array.isArray(parsed?.external?.blockers) ? parsed.external.blockers.length : null,
    blockers: Array.isArray(parsed?.external?.blockers) ? parsed.external.blockers : [],
    parseError,
    stdoutTail: String(result.stdout || '').split(/\r?\n/).slice(-12).join('\n').trim(),
    stderrTail: String(result.stderr || '').split(/\r?\n/).slice(-12).join('\n').trim()
  };
}

async function readJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
}

function mdStatus(ok) {
  return ok ? '通过' : '失败';
}

function escapePipes(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

async function main() {
  const generatedAt = new Date();
  const steps = LOCAL_STEPS.map(runStep);
  const launch = runLaunchStatus();
  const artifacts = await readJson('output/release-artifacts.json');
  const handoff = await readJson('output/acceptance-handoff.json');
  const localOk = steps.every(step => step.ok) && launch.ok;
  const goReady = launch.decision === 'GO';
  const pass = localOk && (!strictGo || goReady);
  const conclusion = goReady
    ? 'GO：本地门禁和外部证据均已满足'
    : '本地验收预检通过，但真实上线仍受外部证据阻断';

  const preflight = {
    schema: 'pet-companion-acceptance-preflight-v1',
    generatedAt: generatedAt.toISOString(),
    generatedAtLocal: formatChinaTime(generatedAt),
    strictGo,
    pass,
    conclusion,
    localOk,
    launchDecision: launch.decision,
    externalEvidence: {
      verified: launch.externalVerified,
      total: launch.externalTotal,
      blockerCount: launch.blockerCount,
      blockers: launch.blockers
    },
    artifacts: {
      fileCount: artifacts?.summary?.fileCount || null,
      totalBytes: artifacts?.summary?.totalBytes || null,
      manifestSha256: artifacts?.summary?.manifestSha256 || null
    },
    handoff: {
      json: existsSync('output/acceptance-handoff.json'),
      markdown: existsSync('output/acceptance-handoff.md'),
      decision: handoff?.decision || ''
    },
    steps,
    launch
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(preflight, null, 2)}\n`, 'utf8');

  const stepRows = steps.map(step => `| ${escapePipes(step.label)} | ${mdStatus(step.ok)} | ${step.durationMs}ms | ${escapePipes(step.summary)} |`);
  const blockerRows = launch.blockers.map(item => `| \`${escapePipes(item.id)}\` | ${escapePipes(item.status)} | ${escapePipes(item.label)} |`);
  const markdown = `# 宠伴记 10点验收预检

- 生成时间：${preflight.generatedAtLocal}
- 生成时间（UTC）：${preflight.generatedAt}
- 预检结论：**${preflight.pass ? 'PASS' : 'FAIL'}**
- 上线判定：**${preflight.launchDecision}**
- 说明：${preflight.conclusion}

## 本地预检步骤

| 步骤 | 结果 | 耗时 | 摘要 |
| --- | --- | ---: | --- |
${stepRows.join('\n')}

## 产物摘要

- 文件数：${preflight.artifacts.fileCount != null ? preflight.artifacts.fileCount : 'missing'}
- 总大小：${preflight.artifacts.totalBytes != null ? preflight.artifacts.totalBytes : 'missing'} bytes
- SHA-256：\`${preflight.artifacts.manifestSha256 || 'missing'}\`

## 验收交接包

- JSON：${preflight.handoff.json ? '`output/acceptance-handoff.json`' : '缺失'}
- Markdown：${preflight.handoff.markdown ? '`output/acceptance-handoff.md`' : '缺失'}
- 交接包判定：${preflight.handoff.decision || 'missing'}

## 外部上线阻断

- 外部证据：${preflight.externalEvidence.verified != null ? preflight.externalEvidence.verified : 0}/${preflight.externalEvidence.total != null ? preflight.externalEvidence.total : 0} verified
- 阻断项：${preflight.externalEvidence.blockerCount != null ? preflight.externalEvidence.blockerCount : 0}

${blockerRows.length ? `| ID | 状态 | 事项 |\n| --- | --- | --- |\n${blockerRows.join('\n')}` : '无外部阻断。'}

## 使用口径

- 这个预检只验证本地验收材料、产物一致性、传输边界清单和外部证据状态。
- 它不部署、不上传、不读取真实密钥、不改服务器首页。
- 若需要把 NO_GO 作为脚本失败，执行：\`npm.cmd run acceptance:preflight -- --strict-go\`。
`;

  await writeFile(markdownPath, markdown, 'utf8');
  console.log(`PASS acceptance preflight :: ${jsonPath}`);
  console.log(`PASS acceptance preflight :: ${markdownPath}`);
  console.log(`PASS acceptance preflight :: local ${localOk ? 'PASS' : 'FAIL'}, launch ${launch.decision}, external ${launch.externalVerified}/${launch.externalTotal} verified`);

  if (!pass) process.exit(1);
}

main().catch(error => {
  console.error(`FAIL acceptance preflight :: ${error.message}`);
  process.exit(1);
});

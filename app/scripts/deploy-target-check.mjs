import { existsSync, readFileSync } from 'node:fs';

const checks = [];
const add = (name, pass, detail = '') => checks.push({ name, pass, detail });
const args = new Set(process.argv.slice(2));
const targetPath = args.has('--target')
  ? process.argv[process.argv.indexOf('--target') + 1]
  : existsSync('deploy/target.json')
    ? 'deploy/target.json'
    : 'deploy/target.example.json';

const REQUIRED_FIELDS = [
  'schema',
  'hostLabel',
  'projectRoot',
  'distTarget',
  'deployConfigTarget',
  'dataTarget',
  'mediaTarget'
];

const DANGEROUS_EXACT_PATHS = new Set([
  '/',
  '/root',
  '/home',
  '/tmp',
  '/var',
  '/var/www',
  '/var/www/html',
  '/usr',
  '/usr/share',
  '/usr/share/nginx',
  '/usr/share/nginx/html',
  '/srv',
  '/srv/www',
  '/www',
  '/www/wwwroot',
  '/opt',
  '/etc'
]);

const DANGEROUS_PREFIXES = [
  '/var/www/',
  '/usr/share/nginx/html/',
  '/srv/www/',
  '/www/wwwroot/',
  '/home/*/public_html/',
  '/etc/',
  '/tmp/'
];

const DANGEROUS_PATH_PATTERNS = [
  /^\/home\/[^/]+$/i
];

function normalizePath(value) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

function isPosixAbsolute(value) {
  return /^\//.test(value) && !/^[A-Za-z]:/.test(value);
}

function hasShellRisk(value) {
  return /[`$;&|<>*?()[\]{}'"!~\n\r]/.test(value);
}

function matchesDangerPrefix(path, prefix) {
  if (prefix.includes('*')) {
    const escaped = prefix
      .split('*')
      .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^/]+');
    return new RegExp(`^${escaped}`).test(`${path}/`);
  }
  return `${path}/`.startsWith(prefix);
}

function isDangerousPath(value) {
  const path = normalizePath(value);
  if (DANGEROUS_EXACT_PATHS.has(path)) return true;
  if (DANGEROUS_PATH_PATTERNS.some(pattern => pattern.test(path))) return true;
  return DANGEROUS_PREFIXES.some(prefix => matchesDangerPrefix(path, prefix));
}

function isInside(parent, child) {
  const parentPath = normalizePath(parent);
  const childPath = normalizePath(child);
  return childPath === parentPath || childPath.startsWith(`${parentPath}/`);
}

function isStrictlyInside(parent, child) {
  const parentPath = normalizePath(parent);
  const childPath = normalizePath(child);
  return childPath.startsWith(`${parentPath}/`);
}

function validateTarget(target) {
  const errors = [];
  if (target?.schema !== 'pet-companion-deploy-target-v1') errors.push('schema mismatch');
  for (const field of REQUIRED_FIELDS) {
    if (typeof target?.[field] !== 'string' || target[field].trim().length === 0) {
      errors.push(`${field} is required`);
    }
  }

  const pathFields = REQUIRED_FIELDS.filter(field => field !== 'schema' && field !== 'hostLabel');
  for (const field of pathFields) {
    const value = normalizePath(target?.[field]);
    if (!isPosixAbsolute(value)) errors.push(`${field} must be an absolute POSIX path`);
    if (value.includes('..')) errors.push(`${field} must not contain parent traversal`);
    if (hasShellRisk(value)) errors.push(`${field} contains shell-risk characters`);
    if (isDangerousPath(value)) errors.push(`${field} points at a server homepage/system path: ${value}`);
  }

  if (!isStrictlyInside(target?.projectRoot, target?.distTarget)) {
    errors.push('distTarget must be a child directory of projectRoot, not projectRoot itself');
  }
  if (!isStrictlyInside(target?.projectRoot, target?.deployConfigTarget)) {
    errors.push('deployConfigTarget must be a child directory of projectRoot, not projectRoot itself');
  }
  if (isInside(target?.distTarget, target?.deployConfigTarget) || isInside(target?.deployConfigTarget, target?.distTarget)) {
    errors.push('deployConfigTarget must be separate from distTarget');
  }
  if (isInside(target?.projectRoot, target?.dataTarget) || isInside(target?.dataTarget, target?.projectRoot)) {
    errors.push('dataTarget must be outside projectRoot so uploads cannot overwrite app files');
  }
  if (isInside(target?.projectRoot, target?.mediaTarget) || isInside(target?.mediaTarget, target?.projectRoot)) {
    errors.push('mediaTarget must be outside projectRoot so uploads cannot overwrite app files');
  }
  if (isInside(target?.dataTarget, target?.mediaTarget) || isInside(target?.mediaTarget, target?.dataTarget)) {
    errors.push('mediaTarget must be separate from dataTarget');
  }
  if (isInside(target?.distTarget, target?.dataTarget) || isInside(target?.dataTarget, target?.distTarget)) {
    errors.push('dataTarget must be separate from distTarget');
  }
  if (isInside(target?.distTarget, target?.mediaTarget) || isInside(target?.mediaTarget, target?.distTarget)) {
    errors.push('mediaTarget must be separate from distTarget');
  }
  if (!isInside(target?.projectRoot, target?.distTarget)) {
    errors.push('distTarget must stay inside projectRoot');
  }
  if (!isInside(target?.projectRoot, target?.deployConfigTarget)) {
    errors.push('deployConfigTarget must stay inside projectRoot');
  }
  return errors;
}

function readJsonFile(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
}

let target = null;
try {
  target = readJsonFile(targetPath);
  add('deploy target file readable', true, targetPath);
} catch (error) {
  add('deploy target file readable', false, `${targetPath}: ${error.message}`);
}

if (target) {
  const errors = validateTarget(target);
  add('deploy target schema and required fields valid', errors.length === 0, errors.join('; '));
  add('deploy target keeps dist under app-owned project root', isInside(target.projectRoot, target.distTarget), `${target.distTarget}`);
  add('deploy target keeps deploy config under app-owned project root', isInside(target.projectRoot, target.deployConfigTarget), `${target.deployConfigTarget}`);
  add('deploy target avoids server homepage roots', !['projectRoot', 'distTarget', 'deployConfigTarget', 'dataTarget', 'mediaTarget'].some(field => isDangerousPath(target[field])), targetPath);
  add('deploy target does not use project root as upload directory', isStrictlyInside(target.projectRoot, target.distTarget) && isStrictlyInside(target.projectRoot, target.deployConfigTarget), targetPath);
  add('deploy target keeps config separate from public dist', !isInside(target.distTarget, target.deployConfigTarget) && !isInside(target.deployConfigTarget, target.distTarget), targetPath);
  add('deploy target keeps persistent data outside app files', !isInside(target.projectRoot, target.dataTarget) && !isInside(target.dataTarget, target.projectRoot), `${target.dataTarget}`);
  add('deploy target keeps media outside app files and data', !isInside(target.projectRoot, target.mediaTarget) && !isInside(target.mediaTarget, target.projectRoot) && !isInside(target.dataTarget, target.mediaTarget) && !isInside(target.mediaTarget, target.dataTarget), `${target.mediaTarget}`);
  add('deploy target separates app files from persistent data', !isInside(target.distTarget, target.dataTarget) && !isInside(target.dataTarget, target.distTarget), targetPath);
  add('deploy target separates app files from media uploads', !isInside(target.distTarget, target.mediaTarget) && !isInside(target.mediaTarget, target.distTarget), targetPath);
}

const failed = checks.filter(check => !check.pass);
for (const check of checks) {
  console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
}

if (failed.length) {
  console.error(`\n${failed.length} deploy target check(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} deploy target checks passed.`);

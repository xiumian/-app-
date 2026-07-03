import { createHmac, createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import {
  MEDIA_LOCAL_DIR,
  MEDIA_MAX_BYTES,
  MEDIA_PUBLIC_BASE_URL,
  MEDIA_S3_ACCESS_KEY_ID,
  MEDIA_S3_BUCKET,
  MEDIA_S3_ENDPOINT,
  MEDIA_S3_PREFIX,
  MEDIA_S3_REGION,
  MEDIA_S3_SECRET_ACCESS_KEY,
  MEDIA_STORAGE_DRIVER
} from './config.js';
import { HttpError, requireText } from './http.js';

const MIME_EXTENSIONS = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif']
]);

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) throw new HttpError(400, 'INVALID_MEDIA', '\u56fe\u7247\u683c\u5f0f\u4e0d\u6b63\u786e');
  const mimeType = match[1].toLowerCase();
  if (!MIME_EXTENSIONS.has(mimeType)) throw new HttpError(400, 'UNSUPPORTED_MEDIA_TYPE', '\u4ec5\u652f\u6301 jpg\u3001png\u3001webp\u3001gif \u56fe\u7247');
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length) throw new HttpError(400, 'INVALID_MEDIA', '\u56fe\u7247\u5185\u5bb9\u4e3a\u7a7a');
  if (buffer.length > MEDIA_MAX_BYTES) throw new HttpError(413, 'MEDIA_TOO_LARGE', '\u56fe\u7247\u8d85\u8fc7\u4e0a\u4f20\u5927\u5c0f\u9650\u5236');
  return { buffer, mimeType, extension: MIME_EXTENSIONS.get(mimeType) };
}

function safeOriginalName(value) {
  const name = String(value || '').trim().slice(0, 120);
  return name.replace(/[\\/:*?"<>|]+/g, '-');
}

function buildMediaKey(user, extension) {
  return `${user.id}/${randomUUID()}.${extension}`;
}

function publicUrlForKey(key) {
  if (MEDIA_PUBLIC_BASE_URL) return `${MEDIA_PUBLIC_BASE_URL}/${key.split('/').map(encodeURIComponent).join('/')}`;
  return `/media/files/${key.split('/').map(encodeURIComponent).join('/')}`;
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export async function probeMediaStorage() {
  const checkedAt = new Date().toISOString();

  if (MEDIA_STORAGE_DRIVER === 's3') {
    const required = {
      PET_MEDIA_PUBLIC_BASE_URL: MEDIA_PUBLIC_BASE_URL,
      PET_MEDIA_S3_ENDPOINT: MEDIA_S3_ENDPOINT,
      PET_MEDIA_S3_REGION: MEDIA_S3_REGION,
      PET_MEDIA_S3_BUCKET: MEDIA_S3_BUCKET,
      PET_MEDIA_S3_ACCESS_KEY_ID: MEDIA_S3_ACCESS_KEY_ID,
      PET_MEDIA_S3_SECRET_ACCESS_KEY: MEDIA_S3_SECRET_ACCESS_KEY
    };
    const missing = Object.entries(required)
      .filter(([, value]) => !value)
      .map(([name]) => name);
    const publicBaseUrlHttps = isHttpsUrl(MEDIA_PUBLIC_BASE_URL);
    const endpointHttps = isHttpsUrl(MEDIA_S3_ENDPOINT);
    return {
      ok: missing.length === 0 && publicBaseUrlHttps && endpointHttps,
      driver: 's3',
      configured: missing.length === 0,
      writable: 'external_evidence_required',
      publicBaseUrlHttps,
      endpointHttps,
      checkedAt,
      missing
    };
  }

  const probeKey = `.readycheck-${process.pid}-${Date.now()}.txt`;
  const probeFile = resolve(MEDIA_LOCAL_DIR, probeKey);
  await mkdir(MEDIA_LOCAL_DIR, { recursive: true });
  await writeFile(probeFile, checkedAt, 'utf8');
  const info = await readFile(probeFile, 'utf8');
  await rm(probeFile, { force: true });
  return {
    ok: info === checkedAt,
    driver: 'local',
    writable: true,
    checkedAt,
    bytesWritten: Buffer.byteLength(info)
  };
}

async function storeLocalMedia({ key, buffer }) {
  const filePath = resolve(MEDIA_LOCAL_DIR, key);
  const root = resolve(MEDIA_LOCAL_DIR);
  if (!filePath.startsWith(`${root}\\`) && !filePath.startsWith(`${root}/`)) {
    throw new HttpError(400, 'INVALID_MEDIA_KEY', '\u5a92\u4f53\u8def\u5f84\u4e0d\u5408\u6cd5');
  }
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, buffer);
  return publicUrlForKey(key);
}

function normalizeMediaKey(value) {
  const decodedKey = decodeURIComponent(String(value || ''));
  if (!decodedKey || decodedKey.includes('..') || decodedKey.startsWith('/') || decodedKey.startsWith('\\')) {
    throw new HttpError(400, 'INVALID_MEDIA_KEY', '\u5a92\u4f53\u8def\u5f84\u4e0d\u5408\u6cd5');
  }
  return decodedKey;
}

function assertUserOwnsMediaKey({ user, key }) {
  const ownLocalPrefix = `${user.id}/`;
  const ownPrefixedPrefix = MEDIA_S3_PREFIX ? `${MEDIA_S3_PREFIX}/${user.id}/` : '';
  if (key.startsWith(ownLocalPrefix) || (ownPrefixedPrefix && key.startsWith(ownPrefixedPrefix))) return;
  throw new HttpError(403, 'MEDIA_FORBIDDEN', '\u65e0\u6743\u5220\u9664\u8fd9\u4e2a\u5a92\u4f53\u6587\u4ef6');
}

function localMediaPath(key) {
  const filePath = resolve(MEDIA_LOCAL_DIR, key);
  const root = resolve(MEDIA_LOCAL_DIR);
  if (!filePath.startsWith(`${root}\\`) && !filePath.startsWith(`${root}/`)) {
    throw new HttpError(400, 'INVALID_MEDIA_KEY', '\u5a92\u4f53\u8def\u5f84\u4e0d\u5408\u6cd5');
  }
  return filePath;
}

async function deleteLocalMedia(key) {
  const filePath = localMediaPath(key);
  let existed = true;
  try {
    await stat(filePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    existed = false;
  }
  await rm(filePath, { force: true });
  return { deleted: existed };
}

function hmac(key, value, encoding) {
  return createHmac('sha256', key).update(value, 'utf8').digest(encoding);
}

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function getSigningKey(dateStamp) {
  const kDate = hmac(`AWS4${MEDIA_S3_SECRET_ACCESS_KEY}`, dateStamp);
  const kRegion = hmac(kDate, MEDIA_S3_REGION);
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
}

function s3ObjectUrl(key) {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return new URL(`${MEDIA_S3_ENDPOINT}/${encodeURIComponent(MEDIA_S3_BUCKET)}/${encodedKey}`);
}

async function storeS3Media({ key, buffer, mimeType }) {
  if (!MEDIA_S3_ENDPOINT || !MEDIA_S3_REGION || !MEDIA_S3_BUCKET || !MEDIA_S3_ACCESS_KEY_ID || !MEDIA_S3_SECRET_ACCESS_KEY) {
    throw new HttpError(500, 'MEDIA_STORAGE_NOT_CONFIGURED', '\u5bf9\u8c61\u5b58\u50a8\u672a\u914d\u7f6e\u5b8c\u6574');
  }

  const url = s3ObjectUrl(key);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(buffer);
  const canonicalUri = url.pathname;
  const canonicalHeaders = [
    `content-type:${mimeType}`,
    `host:${url.host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`
  ].join('\n') + '\n';
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = ['PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${MEDIA_S3_REGION}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
  const signature = hmac(getSigningKey(dateStamp), stringToSign, 'hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${MEDIA_S3_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: authorization,
      'Content-Type': mimeType,
      'X-Amz-Content-Sha256': payloadHash,
      'X-Amz-Date': amzDate
    },
    body: buffer
  });

  if (!response.ok) {
    throw new HttpError(502, 'MEDIA_UPLOAD_FAILED', '\u5bf9\u8c61\u5b58\u50a8\u4e0a\u4f20\u5931\u8d25');
  }

  return publicUrlForKey(key);
}

async function deleteS3Media(key) {
  if (!MEDIA_S3_ENDPOINT || !MEDIA_S3_REGION || !MEDIA_S3_BUCKET || !MEDIA_S3_ACCESS_KEY_ID || !MEDIA_S3_SECRET_ACCESS_KEY) {
    throw new HttpError(500, 'MEDIA_STORAGE_NOT_CONFIGURED', '\u5bf9\u8c61\u5b58\u50a8\u672a\u914d\u7f6e\u5b8c\u6574');
  }

  const url = s3ObjectUrl(key);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex('');
  const canonicalHeaders = [
    `host:${url.host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`
  ].join('\n') + '\n';
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = ['DELETE', url.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${MEDIA_S3_REGION}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
  const signature = hmac(getSigningKey(dateStamp), stringToSign, 'hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${MEDIA_S3_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: authorization,
      'X-Amz-Content-Sha256': payloadHash,
      'X-Amz-Date': amzDate
    }
  });

  if (!response.ok && response.status !== 404) {
    throw new HttpError(502, 'MEDIA_DELETE_FAILED', '\u5bf9\u8c61\u5b58\u50a8\u5220\u9664\u5931\u8d25');
  }

  return { deleted: response.status !== 404 };
}

export async function uploadMedia({ user, body }) {
  const title = body?.title ? requireText(body.title, '\u5a92\u4f53\u6807\u9898', 80) : '';
  const originalName = safeOriginalName(body?.fileName || title || 'image');
  const { buffer, mimeType, extension } = parseDataUrl(body?.dataUrl);
  const relativeKey = buildMediaKey(user, extension);
  const key = MEDIA_STORAGE_DRIVER === 's3' && MEDIA_S3_PREFIX ? `${MEDIA_S3_PREFIX}/${relativeKey}` : relativeKey;
  const url = MEDIA_STORAGE_DRIVER === 's3'
    ? await storeS3Media({ key, buffer, mimeType })
    : await storeLocalMedia({ key, buffer });

  return {
    mediaId: key,
    url,
    mimeType,
    size: buffer.length,
    originalName,
    storageDriver: MEDIA_STORAGE_DRIVER,
    uploadedAt: new Date().toISOString()
  };
}

export async function deleteMedia({ user, key }) {
  const normalizedKey = normalizeMediaKey(key);
  assertUserOwnsMediaKey({ user, key: normalizedKey });
  const result = MEDIA_STORAGE_DRIVER === 's3'
    ? await deleteS3Media(normalizedKey)
    : await deleteLocalMedia(normalizedKey);
  return {
    ok: true,
    mediaId: normalizedKey,
    storageDriver: MEDIA_STORAGE_DRIVER,
    deleted: result.deleted,
    deletedAt: new Date().toISOString()
  };
}

export function mediaKeyFromUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('data:')) return '';
  try {
    const url = raw.startsWith('/') ? new URL(raw, 'https://local.invalid') : new URL(raw);
    const localMatch = url.pathname.match(/^\/media\/files\/(.+)$/);
    if (localMatch) return decodeURIComponent(localMatch[1]);
    if (MEDIA_PUBLIC_BASE_URL && raw.startsWith(`${MEDIA_PUBLIC_BASE_URL}/`)) {
      return decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    }
    return '';
  } catch {
    return raw.startsWith('/media/files/') ? decodeURIComponent(raw.replace(/^\/media\/files\//, '')) : '';
  }
}

export async function deleteUserMedia({ user, keys = [] }) {
  let deletedFiles = 0;
  const uniqueKeys = [...new Set(keys.map(value => mediaKeyFromUrl(value) || String(value || '').trim()).filter(Boolean))];
  for (const key of uniqueKeys) {
    const result = await deleteMedia({ user, key });
    if (result.deleted) deletedFiles += 1;
  }

  let deletedDirectory = false;
  if (MEDIA_STORAGE_DRIVER === 'local') {
    const userDir = localMediaPath(user.id);
    await rm(userDir, { recursive: true, force: true });
    deletedDirectory = true;
  }

  return {
    ok: true,
    storageDriver: MEDIA_STORAGE_DRIVER,
    deletedFiles,
    deletedDirectory,
    scannedReferences: uniqueKeys.length
  };
}

export async function readLocalMedia(key) {
  const decodedKey = normalizeMediaKey(key);
  const filePath = localMediaPath(decodedKey);
  let buffer;
  try {
    buffer = await readFile(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new HttpError(404, 'MEDIA_NOT_FOUND', '\u5a92\u4f53\u6587\u4ef6\u4e0d\u5b58\u5728');
    throw error;
  }
  const ext = extname(filePath).slice(1).toLowerCase();
  const mimeType = [...MIME_EXTENSIONS.entries()].find(([, value]) => value === ext)?.[0] || 'application/octet-stream';
  return { buffer, mimeType };
}

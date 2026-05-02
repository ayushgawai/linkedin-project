import crypto from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config.js';
import { logger } from './logger.js';

const STORAGE_ENV = {
  provider: process.env.STORAGE_PROVIDER || 'none',
  endpoint: process.env.S3_ENDPOINT || null,
  region: process.env.S3_REGION || 'us-east-1',
  accessKeyId: process.env.S3_ACCESS_KEY_ID || null,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || null,
  bucket: process.env.S3_BUCKET || null,
  publicBaseUrl: process.env.S3_PUBLIC_BASE_URL || null,
};

let s3 = null;

/**
 * Public URL base for objects stored in MinIO/S3. When unset, avoid using the
 * Docker-only hostname `minio` — browsers on the host cannot resolve it.
 */
function effectivePublicBaseUrl() {
  if (STORAGE_ENV.publicBaseUrl) {
    return String(STORAGE_ENV.publicBaseUrl).replace(/\/+$/, '');
  }
  const ep = STORAGE_ENV.endpoint || '';
  const m = /^https?:\/\/minio(:(\d+))?/i.exec(ep);
  if (m) {
    const port = m[2] || '9000';
    return `http://127.0.0.1:${port}/${STORAGE_ENV.bucket}`;
  }
  return `${ep.replace(/\/+$/, '')}/${STORAGE_ENV.bucket}`;
}

/**
 * Rewrite URLs already persisted with http://minio:9000/... so any browser can load them.
 */
export function rewriteMediaUrlsForClient(url) {
  if (url == null) return url;
  const s = String(url);
  return s
    .replace(/^http:\/\/minio:9000\//gi, 'http://127.0.0.1:9000/')
    .replace(/^https:\/\/minio:9000\//gi, 'http://127.0.0.1:9000/')
    .replace(/^http:\/\/minio\//gi, 'http://127.0.0.1:9000/')
    .replace(/^https:\/\/minio\//gi, 'http://127.0.0.1:9000/');
}

/** Apply {@link rewriteMediaUrlsForClient} to member row photo fields (mutates copy). */
export function mapMemberMediaRow(row) {
  if (!row || typeof row !== 'object') return row;
  return {
    ...row,
    profile_photo_url:
      row.profile_photo_url == null ? row.profile_photo_url : rewriteMediaUrlsForClient(String(row.profile_photo_url)),
    cover_photo_url:
      row.cover_photo_url == null ? row.cover_photo_url : rewriteMediaUrlsForClient(String(row.cover_photo_url)),
  };
}

function getS3() {
  if (STORAGE_ENV.provider !== 's3') return null;
  if (s3) return s3;
  if (!STORAGE_ENV.bucket || !STORAGE_ENV.endpoint) {
    logger.warn({ ...STORAGE_ENV, secretAccessKey: undefined }, 's3 storage misconfigured; disabling');
    return null;
  }
  s3 = new S3Client({
    region: STORAGE_ENV.region,
    endpoint: STORAGE_ENV.endpoint,
    forcePathStyle: true, // required for MinIO + many S3 compatibles
    credentials:
      STORAGE_ENV.accessKeyId && STORAGE_ENV.secretAccessKey
        ? { accessKeyId: STORAGE_ENV.accessKeyId, secretAccessKey: STORAGE_ENV.secretAccessKey }
        : undefined,
  });
  logger.info({ endpoint: STORAGE_ENV.endpoint, bucket: STORAGE_ENV.bucket }, 's3 object store ready');
  return s3;
}

function parseDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(String(dataUrl || ''));
  if (!m) return null;
  const contentType = m[1];
  const b64 = m[2];
  const body = Buffer.from(b64, 'base64');
  return { contentType, body };
}

export async function maybeStoreDataUrl({ kind, memberId, dataUrl }) {
  // If not a data URL, treat as already-stored URL.
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return { stored: false, url: dataUrl || null };

  const client = getS3();
  if (!client) {
    // Fall back: keep the data URL so the UI still works locally, but warn.
    logger.warn(
      { kind, memberId, size: parsed.body.length, env: config.NODE_ENV },
      'got data URL but object store disabled; keeping inline string',
    );
    return { stored: false, url: dataUrl };
  }

  const ext = parsed.contentType === 'image/png' ? 'png'
    : parsed.contentType === 'image/jpeg' ? 'jpg'
      : parsed.contentType === 'image/webp' ? 'webp'
        : 'bin';
  const key = `${kind}/${memberId}/${crypto.randomUUID()}.${ext}`;

  await client.send(
    new PutObjectCommand({
      Bucket: STORAGE_ENV.bucket,
      Key: key,
      Body: parsed.body,
      ContentType: parsed.contentType,
      ACL: 'public-read', // MinIO bucket policy is public-read; AWS ignores unless allowed.
    }),
  );

  const base = effectivePublicBaseUrl();
  const url = `${base}/${key}`;
  return { stored: true, url };
}


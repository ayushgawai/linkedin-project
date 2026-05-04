import crypto from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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

function getS3() {
  if (STORAGE_ENV.provider !== 's3') return null;
  if (s3) return s3;
  if (!STORAGE_ENV.bucket || !STORAGE_ENV.endpoint) {
    logger.warn('s3 storage misconfigured; post media upload disabled');
    return null;
  }
  s3 = new S3Client({
    region: STORAGE_ENV.region,
    endpoint: STORAGE_ENV.endpoint,
    forcePathStyle: true,
    credentials:
      STORAGE_ENV.accessKeyId && STORAGE_ENV.secretAccessKey
        ? { accessKeyId: STORAGE_ENV.accessKeyId, secretAccessKey: STORAGE_ENV.secretAccessKey }
        : undefined,
  });
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

/**
 * Store a data URL in MinIO/S3 and return a public HTTP URL (same pattern as Profile service).
 */
export async function maybeStorePostMediaDataUrl({ memberId, dataUrl }) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    return { ok: false, error: 'INVALID_DATA_URL', message: 'Expected a base64 data URL (image or video).' };
  }

  const client = getS3();
  if (!client) {
    logger.warn('object store disabled; cannot persist post media');
    return { ok: false, error: 'STORAGE_DISABLED', message: 'Media upload is not configured (S3/MinIO).' };
  }

  const ct = parsed.contentType.toLowerCase();
  let ext = 'bin';
  if (ct.includes('png')) ext = 'png';
  else if (ct.includes('jpeg') || ct.includes('jpg')) ext = 'jpg';
  else if (ct.includes('webp')) ext = 'webp';
  else if (ct.includes('gif')) ext = 'gif';
  else if (ct.includes('mp4')) ext = 'mp4';
  else if (ct.includes('webm')) ext = 'webm';

  const safeMember = String(memberId || 'anon').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 36) || 'anon';
  const key = `post-media/${safeMember}/${crypto.randomUUID()}.${ext}`;

  await client.send(
    new PutObjectCommand({
      Bucket: STORAGE_ENV.bucket,
      Key: key,
      Body: parsed.body,
      ContentType: parsed.contentType,
      ACL: 'public-read',
    }),
  );

  const base = effectivePublicBaseUrl();
  const url = `${base}/${key}`;
  return { ok: true, url };
}

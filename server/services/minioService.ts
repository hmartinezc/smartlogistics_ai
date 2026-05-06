import { randomUUID } from 'node:crypto';
import { Client } from 'minio';

export interface MinioStorageConfig {
  endPoint: string;
  port: number;
  accessKey: string;
  secretKey: string;
  bucketName: string;
  useSSL: boolean;
}

export interface BuildDocumentObjectKeyInput {
  agencyId: string;
  agencyName?: string;
  originalFilename: string;
  documentId?: string;
  now?: Date;
}

export interface PutDocumentObjectInput {
  objectKey: string;
  buffer: Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
}

let minioClient: Client | null = null;
let ensureBucketPromise: Promise<void> | null = null;

function parseBoolean(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ['1', 'true', 'yes', 'y'].includes(value.trim().toLowerCase());
}

function parsePort(value: string | undefined): number {
  const port = Number(value || '9000');
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('MINIO_PORT debe ser un puerto valido.');
  }

  return port;
}

function getAccessKey(): string | undefined {
  return process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER;
}

function getSecretKey(): string | undefined {
  return process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD;
}

export function isMinioConfigured(): boolean {
  return Boolean(process.env.MINIO_ENDPOINT && getAccessKey() && getSecretKey());
}

export function getMinioStorageConfig(): MinioStorageConfig {
  const missing: string[] = [];

  if (!process.env.MINIO_ENDPOINT) {
    missing.push('MINIO_ENDPOINT');
  }

  const accessKey = getAccessKey();
  if (!accessKey) {
    missing.push('MINIO_ACCESS_KEY o MINIO_ROOT_USER');
  }

  const secretKey = getSecretKey();
  if (!secretKey) {
    missing.push('MINIO_SECRET_KEY o MINIO_ROOT_PASSWORD');
  }

  if (missing.length > 0) {
    throw new Error(`Configuracion MinIO incompleta: ${missing.join(', ')}`);
  }

  return {
    endPoint: process.env.MINIO_ENDPOINT as string,
    port: parsePort(process.env.MINIO_PORT),
    accessKey: accessKey as string,
    secretKey: secretKey as string,
    bucketName: process.env.MINIO_BUCKET || 'smart-invoices',
    useSSL: parseBoolean(process.env.MINIO_USE_SSL),
  };
}

export function getMinioClient(): Client {
  if (!minioClient) {
    const config = getMinioStorageConfig();
    minioClient = new Client({
      endPoint: config.endPoint,
      port: config.port,
      useSSL: config.useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });

    minioClient.setAppInfo('smart-logistics-extractor', '1.0.0');
  }

  return minioClient;
}

export function getInvoiceBucketName(): string {
  return getMinioStorageConfig().bucketName;
}

export async function ensureInvoiceBucket(): Promise<void> {
  if (!ensureBucketPromise) {
    ensureBucketPromise = (async () => {
      const config = getMinioStorageConfig();
      const client = getMinioClient();
      const bucketExists = await client.bucketExists(config.bucketName);

      if (!bucketExists) {
        await client.makeBucket(config.bucketName);
      }
    })().catch((error: unknown) => {
      ensureBucketPromise = null;
      throw error;
    });
  }

  return ensureBucketPromise;
}

function sanitizeObjectSegment(value: string, fallback: string): string {
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const sanitized = normalized
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);

  return sanitized || fallback;
}

export function buildDocumentObjectKey(input: BuildDocumentObjectKeyInput): string {
  const now = input.now || new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const agencySegment = input.agencyName
    ? sanitizeObjectSegment(input.agencyName, 'unknown-agency')
    : sanitizeObjectSegment(input.agencyId, 'unknown-agency');
  const safeFilename = sanitizeObjectSegment(input.originalFilename, 'document.pdf');
  const documentId = sanitizeObjectSegment(input.documentId || randomUUID(), randomUUID());

  return `documents/${agencySegment}/${year}/${month}/${documentId}-${safeFilename}`;
}

export async function putDocumentObject(input: PutDocumentObjectInput): Promise<void> {
  await ensureInvoiceBucket();

  const config = getMinioStorageConfig();
  const metadata = {
    'Content-Type': input.contentType || 'application/pdf',
    ...input.metadata,
  };

  await getMinioClient().putObject(
    config.bucketName,
    input.objectKey,
    input.buffer,
    input.buffer.length,
    metadata,
  );
}

export async function getDocumentObject(objectKey: string): Promise<Buffer> {
  await ensureInvoiceBucket();

  const config = getMinioStorageConfig();
  const objectStream = await getMinioClient().getObject(config.bucketName, objectKey);
  const chunks: Buffer[] = [];

  for await (const chunk of objectStream) {
    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk));
    } else if (chunk instanceof Uint8Array) {
      chunks.push(Buffer.from(chunk));
    } else {
      chunks.push(Buffer.from(String(chunk)));
    }
  }

  return Buffer.concat(chunks);
}

export async function removeDocumentObject(objectKey: string): Promise<void> {
  await ensureInvoiceBucket();

  const config = getMinioStorageConfig();
  await getMinioClient().removeObject(config.bucketName, objectKey);
}

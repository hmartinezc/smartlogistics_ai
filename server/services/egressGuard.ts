import { isIP } from 'node:net';
import { resolve4, resolve6 } from 'node:dns/promises';
import { isValidIntegrationEndpointUrl } from '../../shared/integrationConfig.js';

export interface ExternalEndpointValidationResult {
  ok: boolean;
  error?: string;
}

const BLOCKED_HOSTNAMES = new Set(['localhost', 'localhost.localdomain']);

function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
}

function isBlockedIPv4(address: string): boolean {
  const parts = address.split('.').map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }

  const [first, second] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 0 && parts[2] === 2) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && parts[2] === 100) ||
    (first === 203 && second === 0 && parts[2] === 113)
  );
}

function isBlockedIPv6(address: string): boolean {
  const normalized = normalizeHostname(address);

  if (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('fec0:') ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('2001:db8:')
  ) {
    return true;
  }

  const mappedIPv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mappedIPv4 ? isBlockedIPv4(mappedIPv4[1]) : false;
}

function isBlockedIpAddress(address: string): boolean {
  const version = isIP(normalizeHostname(address));
  if (version === 4) {
    return isBlockedIPv4(address);
  }

  if (version === 6) {
    return isBlockedIPv6(address);
  }

  return false;
}

async function resolveEndpointAddresses(hostname: string): Promise<string[]> {
  if (isIP(hostname)) {
    return [hostname];
  }

  const [ipv4Result, ipv6Result] = await Promise.allSettled([
    resolve4(hostname),
    resolve6(hostname),
  ]);
  const addresses = [
    ...(ipv4Result.status === 'fulfilled' ? ipv4Result.value : []),
    ...(ipv6Result.status === 'fulfilled' ? ipv6Result.value : []),
  ];

  return Array.from(new Set(addresses));
}

export async function validateExternalEndpointTarget(
  url: string,
): Promise<ExternalEndpointValidationResult> {
  if (!isValidIntegrationEndpointUrl(url)) {
    return { ok: false, error: 'URL de integración inválida.' };
  }

  const parsed = new URL(url);
  const hostname = normalizeHostname(parsed.hostname);

  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost')) {
    return { ok: false, error: 'El endpoint no puede apuntar a localhost.' };
  }

  const addresses = await resolveEndpointAddresses(hostname).catch(() => []);
  if (addresses.length === 0) {
    return { ok: false, error: 'No se pudo resolver el host del endpoint.' };
  }

  if (addresses.some(isBlockedIpAddress)) {
    return {
      ok: false,
      error: 'El endpoint no puede apuntar a redes internas o direcciones reservadas.',
    };
  }

  return { ok: true };
}

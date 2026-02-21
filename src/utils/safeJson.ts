import { SafeLimits } from '../config/safeLimits.js';
import { ValidationError } from './errors.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function validateSafeStructure(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      validateSafeStructure(item);
    }
    return;
  }

  if (!isPlainObject(value)) {
    if (value !== null && typeof value === 'object') {
      throw new ValidationError('JSON contains unsupported object types.');
    }
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
      throw new ValidationError('JSON contains forbidden keys.');
    }

    validateSafeStructure(child);
  }
}

export function parseSafeJson(raw: string, maxBytes = SafeLimits.MAX_IMPORT_BYTES): unknown {
  const bytes = Buffer.byteLength(raw, 'utf8');
  if (bytes > maxBytes) {
    throw new ValidationError(`JSON exceeds maximum size of ${maxBytes} bytes.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new ValidationError('Invalid JSON payload.');
  }

  validateSafeStructure(parsed);
  return parsed;
}

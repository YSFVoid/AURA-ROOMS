import { ZodError } from 'zod';

export class BotError extends Error {
  public readonly userMessage: string;
  public readonly code: string;
  public readonly requestId?: string;

  constructor(code: string, message: string, userMessage?: string, requestId?: string) {
    super(message);
    this.name = 'BotError';
    this.code = code;
    this.userMessage = userMessage ?? message;
    this.requestId = requestId;
  }
}

export class ValidationError extends BotError {
  constructor(message: string, requestId?: string) {
    super('VALIDATION_ERROR', message, message, requestId);
    this.name = 'ValidationError';
  }
}

export class PermissionError extends BotError {
  constructor(message: string, requestId?: string) {
    super('PERMISSION_ERROR', message, message, requestId);
    this.name = 'PermissionError';
  }
}

export class NotFoundError extends BotError {
  constructor(message: string, requestId?: string) {
    super('NOT_FOUND', message, message, requestId);
    this.name = 'NotFoundError';
  }
}

export function toSafeUserMessage(error: unknown): string {
  if (error instanceof BotError) {
    return error.userMessage;
  }

  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? 'Invalid input.';
  }

  if (error instanceof SyntaxError) {
    return 'Invalid JSON payload.';
  }

  return 'An unexpected error occurred.';
}
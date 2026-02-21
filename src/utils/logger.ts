import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: 'aura-rooms',
    pid: process.pid,
    nodeEnv: env.NODE_ENV,
  },
  redact: {
    paths: [
      '*.token',
      '*.authorization',
      '*.password',
      '*.secret',
      '*.mongodbUri',
      '*.discordToken',
      'req.headers.authorization',
      'env.DISCORD_TOKEN',
      'env.MONGODB_URI',
    ],
    censor: '[REDACTED]',
  },
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
          },
        }
      : undefined,
});

import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export async function connectDatabase(): Promise<void> {
  try {
    await mongoose.connect(env.MONGODB_URI);
    logger.info('MongoDB connected');
  } catch (error) {
    logger.fatal({ error }, 'MongoDB connection failed');
    process.exit(1);
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
}

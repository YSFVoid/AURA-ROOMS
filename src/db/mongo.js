import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

// Force Google DNS for SRV lookups (some networks block SRV queries on local DNS)
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);
export async function connectDatabase() {
    try {
        await mongoose.connect(env.MONGODB_URI, {
            serverSelectionTimeoutMS: 15_000,
            family: 4,
        });
        logger.info('MongoDB connected');
    } catch (error) {
        logger.fatal({ error }, 'MongoDB connection failed');
        process.exit(1);
    }
}

export async function disconnectDatabase() {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
}

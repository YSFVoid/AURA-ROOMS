import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
    DISCORD_TOKEN: z.string().min(1),
    CLIENT_ID: z.string().min(1),
    MONGODB_URI: z.string().min(1),
    GUILD_ID: z.string().optional().default(''),
    LOG_LEVEL: z
        .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
        .optional()
        .default('info'),
    NODE_ENV: z.enum(['development', 'production']).optional().default('development'),
    DEBUG_COMMANDS: z.string().optional().default('false'),
    PREFIX_ENABLED: z.string().optional().default('false'),
    PREFIX: z.string().optional().default('!'),
    PREFIX_ADMIN_ONLY: z.string().optional().default('true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('Environment validation failed', parsed.error.flatten().fieldErrors);
    process.exit(1);
}

export const env = parsed.data;

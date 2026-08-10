import { env } from '../config/env';

type Level = 'debug' | 'info' | 'warn' | 'error';

function write(level: Level, message: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level.toUpperCase()}] ${message}`;
  if (meta !== undefined) {
    // eslint-disable-next-line no-console
    console[level === 'debug' ? 'log' : level](line, meta);
    return;
  }
  // eslint-disable-next-line no-console
  console[level === 'debug' ? 'log' : level](line);
}

export const logger = {
  debug: (message: string, meta?: unknown) => {
    if (!env.isProduction) write('debug', message, meta);
  },
  info: (message: string, meta?: unknown) => write('info', message, meta),
  warn: (message: string, meta?: unknown) => write('warn', message, meta),
  error: (message: string, meta?: unknown) => write('error', message, meta),
};
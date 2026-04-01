import pino from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGS_DIR = path.resolve(__dirname, '../../logs');

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const transport = pino.transport({
  targets: [
    {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
      level: 'info',
    },
    {
      target: 'pino/file',
      options: { destination: path.join(LOGS_DIR, 'server.log') },
      level: 'debug',
    },
  ],
});

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'debug',
    base: {
      pid: false,
    },
  },
  transport
);

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVERS_DIR = join(__dirname, '..', 'servers');

export function getTempDir(httpPort: string): string {
  const filePath = join(SERVERS_DIR, `tmpdir.${httpPort}`);
  try {
    return readFileSync(filePath, 'utf-8').trim();
  } catch {
    throw new Error(`No temp dir found for port ${httpPort} (file: ${filePath})`);
  }
}

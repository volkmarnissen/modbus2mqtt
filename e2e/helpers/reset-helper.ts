import { LOCALHOST } from './ports';

export async function resetServer(port: number): Promise<void> {
  const url = `http://${LOCALHOST}:${port}/api/e2e/reset`;
  const response = await fetch(url, { method: 'POST' });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`E2E reset failed on port ${port}: ${response.status} ${body}`);
  }
}

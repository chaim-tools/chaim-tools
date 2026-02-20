import crypto from 'node:crypto';

/**
 * Compute HMAC-SHA256 signature for request body
 * @param secret - The API secret key
 * @param body - The request body string
 * @returns HMAC signature in format "sha256=<hex>"
 */
export function hmac(secret: string, body: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}


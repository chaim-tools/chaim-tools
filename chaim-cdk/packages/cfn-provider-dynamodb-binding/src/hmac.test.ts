import { describe, it, expect } from 'vitest';
import { hmac } from './hmac';

describe('hmac', () => {
  it('should compute HMAC-SHA256 signature', () => {
    const secret = 'test-secret';
    const body = '{"test": "data"}';
    const signature = hmac(secret, body);

    expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it('should produce consistent signatures for same input', () => {
    const secret = 'test-secret';
    const body = '{"test": "data"}';
    const sig1 = hmac(secret, body);
    const sig2 = hmac(secret, body);

    expect(sig1).toBe(sig2);
  });

  it('should produce different signatures for different secrets', () => {
    const body = '{"test": "data"}';
    const sig1 = hmac('secret1', body);
    const sig2 = hmac('secret2', body);

    expect(sig1).not.toBe(sig2);
  });

  it('should produce different signatures for different bodies', () => {
    const secret = 'test-secret';
    const sig1 = hmac(secret, '{"test": "data1"}');
    const sig2 = hmac(secret, '{"test": "data2"}');

    expect(sig1).not.toBe(sig2);
  });
});


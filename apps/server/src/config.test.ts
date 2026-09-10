import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isOriginAllowed, isPrivateNetworkHost } from './config.js';

describe('isPrivateNetworkHost', () => {
  it.each([
    'localhost',
    'app.localhost',
    'my-mac.local',
    '127.0.0.1',
    '10.0.0.5',
    '192.168.10.70',
    '172.16.4.2',
    '172.31.255.1',
    '169.254.1.1',
    '::1',
    '[::1]',
    '::ffff:192.168.1.2',
    'fd12:3456::1',
    'fe80::1',
  ])('accepts %s', (host) => {
    expect(isPrivateNetworkHost(host)).toBe(true);
  });

  it.each(['example.com', '8.8.8.8', '172.32.0.1', '172.15.0.1', '11.0.0.1', '2001:db8::1'])(
    'rejects %s',
    (host) => {
      expect(isPrivateNetworkHost(host)).toBe(false);
    },
  );
});

describe('isOriginAllowed', () => {
  const env = { ...process.env };
  beforeEach(() => {
    delete process.env.MD_ALLOW_LAN_ORIGINS;
    delete process.env.WEB_PORT;
    delete process.env['NODE_ENV'];
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('always allows explicit allowlist entries', () => {
    expect(isOriginAllowed('http://127.0.0.1:5173')).toBe(true);
    expect(isOriginAllowed('http://localhost:5173')).toBe(true);
    expect(isOriginAllowed('http://LOCALHOST:5173/')).toBe(true);
  });

  it('allows any LAN address on the web dev port in dev', () => {
    expect(isOriginAllowed('http://192.168.10.70:5173')).toBe(true);
    expect(isOriginAllowed('http://10.1.2.3:5173')).toBe(true);
    expect(isOriginAllowed('http://my-mac.local:5173')).toBe(true);
    expect(isOriginAllowed('http://[fe80::1]:5173')).toBe(true);
  });

  it('rejects LAN origins on other ports', () => {
    expect(isOriginAllowed('http://192.168.10.70:3000')).toBe(false);
    expect(isOriginAllowed('http://192.168.10.70')).toBe(false);
  });

  it('honours WEB_PORT', () => {
    process.env.WEB_PORT = '4000';
    expect(isOriginAllowed('http://192.168.10.70:4000')).toBe(true);
    expect(isOriginAllowed('http://192.168.10.70:5173')).toBe(false);
  });

  it('never implicitly allows public hosts', () => {
    expect(isOriginAllowed('http://example.com:5173')).toBe(false);
    expect(isOriginAllowed('http://8.8.8.8:5173')).toBe(false);
    expect(isOriginAllowed('null')).toBe(false);
    expect(isOriginAllowed('')).toBe(false);
    expect(isOriginAllowed(undefined)).toBe(false);
  });

  it('disables LAN matching in production', () => {
    process.env['NODE_ENV'] = 'production';
    expect(isOriginAllowed('http://192.168.10.70:5173')).toBe(false);
    expect(isOriginAllowed('http://127.0.0.1:5173')).toBe(true);
  });

  it('MD_ALLOW_LAN_ORIGINS overrides NODE_ENV both ways', () => {
    process.env['NODE_ENV'] = 'production';
    process.env.MD_ALLOW_LAN_ORIGINS = '1';
    expect(isOriginAllowed('http://192.168.10.70:5173')).toBe(true);
    delete process.env['NODE_ENV'];
    process.env.MD_ALLOW_LAN_ORIGINS = '0';
    expect(isOriginAllowed('http://192.168.10.70:5173')).toBe(false);
  });
});

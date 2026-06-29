import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_REQUEST_AUTH, DEFAULT_REQUEST_CONFIG, createKeyValueRow } from '../domain/request-config';
import { buildExecutionPayload, hasUnresolvedVars } from '../lib/request-config';

describe('request-config', () => {
  describe('buildExecutionPayload', () => {
    it('resolves env vars in URL, query params, and headers', () => {
      const config = {
        ...DEFAULT_REQUEST_CONFIG,
        params: [createKeyValueRow({ key: 'q', value: '{{SEARCH}}', enabled: true })],
        headers: [createKeyValueRow({ key: 'X-Trace', value: '{{TRACE_ID}}', enabled: true })],
        auth: { ...DEFAULT_REQUEST_AUTH, type: 'none' as const },
      };

      const payload = buildExecutionPayload(
        config,
        'GET',
        'https://{{HOST}}/items',
        [
          { key: 'HOST', value: 'api.example.com' },
          { key: 'SEARCH', value: 'forge' },
          { key: 'TRACE_ID', value: 'abc-123' },
        ]
      );

      assert.equal(payload.url, 'https://api.example.com/items?q=forge');
      assert.equal(payload.headers['X-Trace'], 'abc-123');
      assert.equal(payload.body, undefined);
    });

    it('adds bearer authorization header', () => {
      const config = {
        ...DEFAULT_REQUEST_CONFIG,
        auth: { ...DEFAULT_REQUEST_AUTH, type: 'bearer' as const, bearerToken: '{{TOKEN}}' },
      };

      const payload = buildExecutionPayload(config, 'POST', 'https://example.com', [
        { key: 'TOKEN', value: 'secret-token' },
      ]);

      assert.equal(payload.headers.Authorization, 'Bearer secret-token');
    });

    it('builds basic auth header from username and password', () => {
      const config = {
        ...DEFAULT_REQUEST_CONFIG,
        auth: {
          ...DEFAULT_REQUEST_AUTH,
          type: 'basic' as const,
          basicUsername: 'user',
          basicPassword: 'pass',
        },
      };

      const payload = buildExecutionPayload(config, 'GET', 'https://example.com', []);
      const expected = Buffer.from('user:pass').toString('base64');
      assert.equal(payload.headers.Authorization, `Basic ${expected}`);
    });

    it('adds JSON body and content type for POST requests', () => {
      const config = {
        ...DEFAULT_REQUEST_CONFIG,
        bodyType: 'json' as const,
        body: '{"name":"HttpForge"}',
        auth: { ...DEFAULT_REQUEST_AUTH, type: 'none' as const },
      };

      const payload = buildExecutionPayload(config, 'POST', 'https://example.com', []);

      assert.equal(payload.body, '{"name":"HttpForge"}');
      assert.equal(payload.headers['Content-Type'], 'application/json');
    });

    it('omits body for GET and HEAD requests', () => {
      const config = {
        ...DEFAULT_REQUEST_CONFIG,
        bodyType: 'json' as const,
        body: '{"ignored":true}',
        auth: { ...DEFAULT_REQUEST_AUTH, type: 'none' as const },
      };

      assert.equal(buildExecutionPayload(config, 'GET', 'https://example.com', []).body, undefined);
      assert.equal(buildExecutionPayload(config, 'HEAD', 'https://example.com', []).body, undefined);
    });

    it('skips disabled or empty key-value rows', () => {
      const config = {
        ...DEFAULT_REQUEST_CONFIG,
        params: [
          createKeyValueRow({ key: '', value: 'ignored', enabled: true }),
          createKeyValueRow({ key: 'enabled', value: 'yes', enabled: true }),
          createKeyValueRow({ key: 'disabled', value: 'no', enabled: false }),
        ],
        auth: { ...DEFAULT_REQUEST_AUTH, type: 'none' as const },
      };

      const payload = buildExecutionPayload(config, 'GET', 'https://example.com', []);
      assert.match(payload.url, /enabled=yes/);
      assert.doesNotMatch(payload.url, /disabled=/);
    });
  });

  describe('hasUnresolvedVars', () => {
    it('detects unresolved template placeholders', () => {
      assert.equal(hasUnresolvedVars('https://{{HOST}}/api'), true);
      assert.equal(hasUnresolvedVars('https://example.com/api'), false);
    });
  });
});

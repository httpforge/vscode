import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_REQUEST_AUTH, DEFAULT_REQUEST_CONFIG } from '../domain/request-config';
import { requestToConfig } from '../stateAdapter';
import type { ApiRequest } from '../types';

function makeRequest(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return {
    id: 'req-1',
    name: 'Test',
    method: 'GET',
    url: 'https://example.com',
    params: [],
    headers: [],
    authType: 'none',
    authToken: '',
    body: '',
    ...overrides,
  };
}

describe('stateAdapter', () => {
  describe('requestToConfig', () => {
    it('preserves full auth config from requestConfig instead of legacy authToken', () => {
      const request = makeRequest({
        authType: 'basic',
        authToken: 'legacy-password-only',
        requestConfig: {
          ...DEFAULT_REQUEST_CONFIG,
          auth: {
            ...DEFAULT_REQUEST_AUTH,
            type: 'basic',
            basicUsername: 'alice',
            basicPassword: 'secret',
          },
        },
      });

      const config = requestToConfig(request);

      assert.equal(config.auth.type, 'basic');
      assert.equal(config.auth.basicUsername, 'alice');
      assert.equal(config.auth.basicPassword, 'secret');
    });

    it('falls back to legacy auth fields when requestConfig is missing', () => {
      const request = makeRequest({
        authType: 'bearer',
        authToken: 'legacy-token',
      });

      const config = requestToConfig(request);

      assert.equal(config.auth.type, 'bearer');
      assert.equal(config.auth.bearerToken, 'legacy-token');
    });
  });
});

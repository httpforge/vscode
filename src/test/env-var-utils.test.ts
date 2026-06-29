import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ENV_VAR_NAME_PATTERN, normalizeEnvVarName, validateEnvVarName } from '../lib/env-var-utils';

describe('env-var-utils', () => {
  describe('normalizeEnvVarName', () => {
    it('trims, uppercases, and strips invalid characters', () => {
      assert.equal(normalizeEnvVarName('  base_url  '), 'BASE_URL');
      assert.equal(normalizeEnvVarName('api-key'), 'APIKEY');
      assert.equal(normalizeEnvVarName('host.name'), 'HOSTNAME');
    });

    it('returns empty string for whitespace-only input', () => {
      assert.equal(normalizeEnvVarName('   '), '');
    });
  });

  describe('validateEnvVarName', () => {
    it('accepts valid names starting with a letter', () => {
      const result = validateEnvVarName('BASE_URL');
      assert.equal(result.valid, true);
      assert.equal(result.normalized, 'BASE_URL');
      assert.equal(result.error, undefined);
    });

    it('rejects empty names', () => {
      const result = validateEnvVarName('   ');
      assert.equal(result.valid, false);
      assert.equal(result.error, 'Variable name is required');
    });

    it('rejects names that do not start with a letter', () => {
      const result = validateEnvVarName('1API_KEY');
      assert.equal(result.valid, false);
      assert.match(result.error ?? '', /uppercase letters/i);
    });

    it('normalizes input before validating', () => {
      const result = validateEnvVarName('  access_token  ');
      assert.equal(result.valid, true);
      assert.equal(result.normalized, 'ACCESS_TOKEN');
    });
  });

  describe('ENV_VAR_NAME_PATTERN', () => {
    it('matches canonical env var names', () => {
      assert.ok(ENV_VAR_NAME_PATTERN.test('BASE_URL'));
      assert.ok(ENV_VAR_NAME_PATTERN.test('API_KEY_2'));
      assert.ok(!ENV_VAR_NAME_PATTERN.test('_PRIVATE'));
      assert.ok(!ENV_VAR_NAME_PATTERN.test('2FA_TOKEN'));
    });
  });
});

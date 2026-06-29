import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeAvgResponse,
  computeRequestsPerSec,
  computeSuccessRate,
  formatBytes,
  formatTimeAgo,
  resolveEnvVars,
  tryFormatJson,
  tryParseJson,
} from '../lib/request-utils';

describe('request-utils', () => {
  describe('resolveEnvVars', () => {
    it('replaces known variables in double-brace syntax', () => {
      const result = resolveEnvVars('https://{{HOST}}/api/{{VERSION}}', [
        { key: 'HOST', value: 'example.com' },
        { key: 'VERSION', value: 'v1' },
      ]);
      assert.equal(result, 'https://example.com/api/v1');
    });

    it('leaves unresolved placeholders intact', () => {
      const result = resolveEnvVars('{{MISSING}}', [{ key: 'OTHER', value: 'x' }]);
      assert.equal(result, '{{MISSING}}');
    });

    it('treats empty variable values as unresolved', () => {
      const result = resolveEnvVars('{{TOKEN}}', [{ key: 'TOKEN', value: '   ' }]);
      assert.equal(result, '{{TOKEN}}');
    });
  });

  describe('formatBytes', () => {
    it('formats byte sizes with appropriate units', () => {
      assert.equal(formatBytes(512), '512 B');
      assert.equal(formatBytes(2048), '2.00 KB');
      assert.equal(formatBytes(5 * 1024 * 1024), '5.00 MB');
    });
  });

  describe('tryParseJson / tryFormatJson', () => {
    it('parses valid JSON', () => {
      assert.deepEqual(tryParseJson('{"a":1}'), { a: 1 });
    });

    it('returns null for invalid JSON', () => {
      assert.equal(tryParseJson('{bad json'), null);
    });

    it('pretty-prints valid JSON bodies', () => {
      assert.equal(tryFormatJson('{"a":1}'), '{\n  "a": 1\n}');
    });

    it('returns original text when JSON is invalid', () => {
      assert.equal(tryFormatJson('plain text'), 'plain text');
    });
  });

  describe('formatTimeAgo', () => {
    it('describes recent timestamps relative to now', () => {
      const now = Date.now();
      assert.equal(formatTimeAgo(now - 5_000), 'just now');
      assert.equal(formatTimeAgo(now - 45_000), '45s ago');
      assert.equal(formatTimeAgo(now - 120_000), '2 min ago');
      assert.equal(formatTimeAgo(now - 7_200_000), '2 hr ago');
    });
  });

  describe('computeAvgResponse', () => {
    it('returns 0 for empty input', () => {
      assert.equal(computeAvgResponse([]), 0);
    });

    it('rounds the average duration', () => {
      assert.equal(computeAvgResponse([100, 200, 301]), 200);
    });
  });

  describe('computeSuccessRate', () => {
    it('counts 2xx and 3xx as success', () => {
      assert.equal(computeSuccessRate([200, 301, 404, 500]), 50);
    });

    it('returns 0 when there is no history', () => {
      assert.equal(computeSuccessRate([]), 0);
    });
  });

  describe('computeRequestsPerSec', () => {
    it('returns 0 for empty history', () => {
      assert.equal(computeRequestsPerSec([]), '0');
    });

    it('returns 1.0 for a single entry', () => {
      assert.equal(computeRequestsPerSec([{ timestamp: Date.now() }]), '1.0');
    });

    it('computes rate from the newest 20 entries', () => {
      const base = Date.now();
      const history = [
        { timestamp: base },
        { timestamp: base - 10_000 },
      ];
      assert.equal(computeRequestsPerSec(history), '0.2');
    });
  });
});

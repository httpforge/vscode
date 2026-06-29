import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Collection, Protocol } from '../domain';
import {
  BASE_URL_VAR,
  defaultCollectionNameForProtocol,
  defaultMethodForProtocol,
  defaultNameForProtocol,
  defaultUrlForProtocol,
  getCanonicalProtocolCollection,
  getProtocolCollections,
  normalizeProtocol,
  resolveRequestProtocol,
  showsHttpMethod,
} from '../lib/protocol-utils';

describe('protocol-utils', () => {
  describe('normalizeProtocol', () => {
    it('returns known protocols unchanged', () => {
      assert.equal(normalizeProtocol('graphql'), 'graphql');
      assert.equal(normalizeProtocol('websocket'), 'websocket');
    });

    it('falls back to http for unknown or missing values', () => {
      assert.equal(normalizeProtocol(undefined), 'http');
      assert.equal(normalizeProtocol('unknown'), 'http');
      assert.equal(normalizeProtocol(null), 'http');
    });
  });

  describe('defaultMethodForProtocol', () => {
    it('uses POST for graphql and soap', () => {
      assert.equal(defaultMethodForProtocol('graphql'), 'POST');
      assert.equal(defaultMethodForProtocol('soap'), 'POST');
    });

    it('uses GET for http and other protocols', () => {
      assert.equal(defaultMethodForProtocol('http'), 'GET');
      assert.equal(defaultMethodForProtocol('websocket'), 'GET');
    });
  });

  describe('defaultNameForProtocol', () => {
    it('returns protocol-specific default names', () => {
      assert.equal(defaultNameForProtocol('graphql'), 'Untitled Query');
      assert.equal(defaultNameForProtocol('soap'), 'Untitled SOAP Request');
      assert.equal(defaultNameForProtocol('websocket'), 'Untitled WebSocket');
      assert.equal(defaultNameForProtocol('http'), 'Untitled Request');
    });
  });

  describe('defaultUrlForProtocol', () => {
    it('builds URLs with the BASE_URL placeholder', () => {
      assert.equal(defaultUrlForProtocol('http'), BASE_URL_VAR);
      assert.equal(defaultUrlForProtocol('graphql'), `${BASE_URL_VAR}/graphql`);
      assert.equal(defaultUrlForProtocol('soap'), `${BASE_URL_VAR}/soap`);
      assert.equal(defaultUrlForProtocol('websocket'), `${BASE_URL_VAR}/ws`);
    });
  });

  describe('defaultCollectionNameForProtocol', () => {
    it('uses the protocol display name', () => {
      assert.equal(defaultCollectionNameForProtocol('http'), 'HTTP Collection');
      assert.equal(defaultCollectionNameForProtocol('graphql'), 'GraphQL Collection');
    });
  });

  describe('getProtocolCollections', () => {
    it('filters collections by normalized protocol', () => {
      const collections: Collection[] = [
        { id: '1', name: 'HTTP Collection', protocol: 'http', requests: [] },
        { id: '2', name: 'GraphQL Collection', protocol: 'graphql', requests: [] },
        { id: '3', name: 'WebSocket Collection', protocol: 'websocket', requests: [] },
      ];

      const httpCollections = getProtocolCollections({ collections }, 'http');
      assert.equal(httpCollections.length, 1);
      assert.equal(httpCollections[0].id, '1');
    });

    it('returns an empty array when project is missing', () => {
      assert.deepEqual(getProtocolCollections(null, 'http'), []);
    });
  });

  describe('getCanonicalProtocolCollection', () => {
    it('prefers the default collection name', () => {
      const collections: Collection[] = [
        { id: '1', name: 'Custom HTTP', protocol: 'http', requests: [] },
        { id: '2', name: 'HTTP Collection', protocol: 'http', requests: [] },
      ];

      const canonical = getCanonicalProtocolCollection({ collections }, 'http');
      assert.equal(canonical?.id, '2');
    });

    it('returns undefined when no collections exist', () => {
      assert.equal(getCanonicalProtocolCollection({ collections: [] }, 'http'), undefined);
    });
  });

  describe('resolveRequestProtocol', () => {
    const project = {
      collections: [
        {
          id: 'col-1',
          name: 'GraphQL Collection',
          protocol: 'graphql' as Protocol,
          requests: [{ id: 'req-1', name: 'Query', method: 'POST' as const, url: '/gql', protocol: 'graphql' as Protocol }],
        },
      ],
    };

    it('resolves protocol from the request collection', () => {
      assert.equal(resolveRequestProtocol(project, 'req-1'), 'graphql');
    });

    it('returns fallback when request is not found', () => {
      assert.equal(resolveRequestProtocol(project, 'missing', 'soap'), 'soap');
      assert.equal(resolveRequestProtocol(null, 'req-1'), 'http');
    });
  });

  describe('showsHttpMethod', () => {
    it('only shows HTTP method selector for http protocol', () => {
      assert.equal(showsHttpMethod('http'), true);
      assert.equal(showsHttpMethod('graphql'), false);
    });
  });
});

import { protocols } from '../appConfig';

import type { HttpMethod, Protocol, Collection } from '../domain';



export const VALID_PROTOCOLS = new Set<string>([
  'http', 'graphql', 'soap', 'websocket', 'grpc', 'socketio', 'mqtt', 'ai', 'mcp',
]);



export function normalizeProtocol(value?: string | null): Protocol {

  if (value && VALID_PROTOCOLS.has(value)) return value as Protocol;

  return 'http';

}



export function getProtocolMeta(protocol: string) {

  return protocols.find((p) => p.id === protocol) ?? protocols[0];

}



export function defaultMethodForProtocol(protocol: Protocol): HttpMethod {

  switch (protocol) {

    case 'graphql':

    case 'soap':

      return 'POST';

    default:

      return 'GET';

  }

}



export function defaultNameForProtocol(protocol: Protocol): string {

  switch (protocol) {

    case 'graphql':

      return 'Untitled Query';

    case 'soap':

      return 'Untitled SOAP Request';

    case 'websocket':

      return 'Untitled WebSocket';

    default:

      return 'Untitled Request';

  }

}



export function defaultCollectionNameForProtocol(protocol: Protocol): string {

  return `${getProtocolMeta(protocol).name} Collection`;

}



export const BASE_URL_VAR = '{{BASE_URL}}';



export function defaultUrlForProtocol(protocol: Protocol): string {

  switch (protocol) {

    case 'graphql':

      return `${BASE_URL_VAR}/graphql`;

    case 'soap':

      return `${BASE_URL_VAR}/soap`;

    case 'websocket':

      return `${BASE_URL_VAR}/ws`;

    case 'http':

    default:

      return BASE_URL_VAR;

  }

}



export function getProtocolCollections(

  project: { collections: Collection[] } | null | undefined,

  protocol: Protocol

): Collection[] {

  return (project?.collections ?? []).filter((col) => normalizeProtocol(col.protocol) === protocol);

}



export function getCanonicalProtocolCollection(

  project: { collections: Collection[] } | null | undefined,

  protocol: Protocol

): Collection | undefined {

  const cols = getProtocolCollections(project, protocol);

  if (cols.length === 0) return undefined;

  const defaultName = defaultCollectionNameForProtocol(protocol);

  return cols.find((col) => col.name === defaultName) ?? cols[0];

}



export function resolveRequestProtocol(

  project: { collections: Collection[] } | null | undefined,

  requestId: string | null | undefined,

  fallback: Protocol = 'http'

): Protocol {

  if (!project || !requestId) return fallback;

  const collection = project.collections.find((col) => col.requests.some((req) => req.id === requestId));

  if (collection) return normalizeProtocol(collection.protocol);

  const request = project.collections.flatMap((col) => col.requests).find((req) => req.id === requestId);

  return request ? normalizeProtocol(request.protocol) : fallback;

}



export const DEFAULT_GRAPHQL_QUERY = `# Enter your GraphQL query`;



export const DEFAULT_SOAP_ENVELOPE = `<?xml version="1.0" encoding="UTF-8"?>

<soapenv:Envelope

    xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"

    xmlns:web="http://example.com/webservice">



   <soapenv:Header/>



   <soapenv:Body>

      <web:GetUser>

         <web:UserId>123</web:UserId>

      </web:GetUser>

   </soapenv:Body>



</soapenv:Envelope>`;



export const DEFAULT_SOAP_ACTION = 'GetUser';



export function showsHttpMethod(protocol: Protocol): boolean {

  return protocol === 'http';

}



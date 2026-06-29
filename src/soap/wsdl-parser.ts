export interface WsdlOperation {
  name: string;
  soapAction: string;
}

export interface WsdlParseResult {
  targetNamespace: string;
  serviceUrl?: string;
  operations: WsdlOperation[];
}

function extractTargetNamespace(wsdl: string): string {
  const match = wsdl.match(/targetNamespace=["']([^"']+)["']/);
  return match?.[1] ?? 'http://example.com/webservice';
}

function extractServiceUrl(wsdl: string): string | undefined {
  const locationMatch = wsdl.match(/<(?:[\w]+:)?address\s+location=["']([^"']+)["']/i);
  return locationMatch?.[1];
}

function extractOperations(wsdl: string): WsdlOperation[] {
  const operations: WsdlOperation[] = [];
  const seen = new Set<string>();

  const portTypeOps = [...wsdl.matchAll(/<(?:[\w]+:)?operation\s+name=["']([^"']+)["']/gi)];
  for (const match of portTypeOps) {
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);

    const blockRegex = new RegExp(
      `<(?:[\\w]+:)?operation\\s+name=["']${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][\\s\\S]*?>`,
      'i'
    );
    const block = wsdl.match(blockRegex)?.[0] ?? '';
    const soapActionMatch =
      block.match(/soapAction=["']([^"']*)["']/i) ??
      wsdl.match(
        new RegExp(
          `operation\\s+name=["']${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][\\s\\S]*?soapAction=["']([^"']*)["']`,
          'i'
        )
      );

    operations.push({
      name,
      soapAction: soapActionMatch?.[1]?.trim() || name,
    });
  }

  return operations;
}

export function parseWsdl(wsdlXml: string): WsdlParseResult {
  const trimmed = wsdlXml.trim();
  if (!trimmed.includes('definitions') && !trimmed.includes('wsdl:')) {
    throw new Error('Invalid WSDL: expected a WSDL definitions document');
  }

  return {
    targetNamespace: extractTargetNamespace(trimmed),
    serviceUrl: extractServiceUrl(trimmed),
    operations: extractOperations(trimmed),
  };
}

export function buildSoapEnvelope(
  operationName: string,
  targetNamespace: string,
  prefix = 'web'
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
    xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:${prefix}="${targetNamespace}">

   <soapenv:Header/>

   <soapenv:Body>
      <${prefix}:${operationName}>
         <!-- Add request parameters here -->
      </${prefix}:${operationName}>
   </soapenv:Body>

</soapenv:Envelope>`;
}

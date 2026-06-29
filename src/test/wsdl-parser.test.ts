import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSoapEnvelope, parseWsdl } from '../soap/wsdl-parser';

const SAMPLE_WSDL = `<?xml version="1.0" encoding="UTF-8"?>
<wsdl:definitions
  xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
  targetNamespace="http://example.com/webservice">
  <wsdl:portType name="ExamplePortType">
    <wsdl:operation name="GetUser">
      <wsdl:input message="tns:GetUserRequest" soapAction="http://example.com/GetUser"/>
    </wsdl:operation>
    <wsdl:operation name="ListUsers"/>
  </wsdl:portType>
  <wsdl:service name="ExampleService">
    <wsdl:port binding="tns:ExampleBinding" name="ExamplePort">
      <soap:address location="https://api.example.com/soap"/>
    </wsdl:port>
  </wsdl:service>
</wsdl:definitions>`;

describe('wsdl-parser', () => {
  describe('parseWsdl', () => {
    it('extracts namespace, service URL, and operations', () => {
      const result = parseWsdl(SAMPLE_WSDL);

      assert.equal(result.targetNamespace, 'http://example.com/webservice');
      assert.equal(result.serviceUrl, 'https://api.example.com/soap');
      assert.equal(result.operations.length, 2);
      assert.deepEqual(result.operations[0], {
        name: 'GetUser',
        soapAction: 'http://example.com/GetUser',
      });
      assert.deepEqual(result.operations[1], {
        name: 'ListUsers',
        soapAction: 'ListUsers',
      });
    });

    it('throws for non-WSDL documents', () => {
      assert.throws(
        () => parseWsdl('<html><body>not wsdl</body></html>'),
        /Invalid WSDL/
      );
    });
  });

  describe('buildSoapEnvelope', () => {
    it('builds an envelope with the operation and namespace', () => {
      const envelope = buildSoapEnvelope('GetUser', 'http://example.com/webservice');

      assert.match(envelope, /xmlns:web="http:\/\/example.com\/webservice"/);
      assert.match(envelope, /<web:GetUser>/);
      assert.match(envelope, /<\/web:GetUser>/);
    });

    it('supports a custom namespace prefix', () => {
      const envelope = buildSoapEnvelope('Ping', 'http://example.com/ping', 'svc');
      assert.match(envelope, /xmlns:svc="http:\/\/example.com\/ping"/);
      assert.match(envelope, /<svc:Ping>/);
    });
  });
});

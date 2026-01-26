import * as assert from 'assert';
import { parseHttpFile, serializeToHttpFile, parsedRequestToRequest } from '../parser/HttpParser';
import { Request, HttpMethod } from '../models/Collection';

suite('HTTP Parser Test Suite', () => {

    suite('Variable Transformation on Import', () => {
        test('should transform {{$dotenv VAR}} to {{VAR}} in URL', () => {
            const content = `GET https://api.example.com/{{$dotenv BASE_PATH}}/users`;
            const result = parseHttpFile(content);
            assert.strictEqual(result.requests.length, 1);
            assert.strictEqual(result.requests[0].url, 'https://api.example.com/{{BASE_PATH}}/users');
        });

        test('should transform {{$dotenv VAR}} to {{VAR}} in headers', () => {
            const content = `GET https://api.example.com/users
Authorization: Bearer {{$dotenv AUTH_TOKEN}}`;
            const result = parseHttpFile(content);
            assert.strictEqual(result.requests.length, 1);
            assert.strictEqual(result.requests[0].headers[0].value, 'Bearer {{AUTH_TOKEN}}');
        });

        test('should transform {{$dotenv VAR}} to {{VAR}} in body', () => {
            const content = `POST https://api.example.com/users
Content-Type: application/json

{"apiKey": "{{$dotenv API_KEY}}"}`;
            const result = parseHttpFile(content);
            assert.strictEqual(result.requests.length, 1);
            assert.strictEqual(result.requests[0].body, '{"apiKey": "{{API_KEY}}"}');
        });

        test('should transform {{$dotenv VAR}} to {{VAR}} in file-level variables', () => {
            const content = `@baseUrl = {{$dotenv BASE_URL}}

GET {{baseUrl}}/users`;
            const result = parseHttpFile(content);
            assert.strictEqual(result.variables['baseUrl'], '{{BASE_URL}}');
        });

        test('should handle multiple {{$dotenv}} variables in one line', () => {
            const content = `GET https://{{$dotenv HOST}}:{{$dotenv PORT}}/api`;
            const result = parseHttpFile(content);
            assert.strictEqual(result.requests[0].url, 'https://{{HOST}}:{{PORT}}/api');
        });
    });

    suite('Variable Transformation on Export', () => {
        const createRequest = (overrides: Partial<Request>): Request => ({
            id: 'test-123',
            name: 'Test Request',
            method: 'GET' as HttpMethod,
            url: 'https://api.example.com',
            headers: [],
            body: { type: 'none', content: '' },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            ...overrides
        });

        test('should transform {{VAR}} to {{$dotenv VAR}} in URL', () => {
            const request = createRequest({
                url: 'https://api.example.com/{{BASE_PATH}}/users'
            });
            const result = serializeToHttpFile([request]);
            assert.ok(result.includes('{{$dotenv BASE_PATH}}'), 'Should contain $dotenv transformation');
        });

        test('should transform {{VAR}} to {{$dotenv VAR}} in headers', () => {
            const request = createRequest({
                headers: [{ name: 'Authorization', value: 'Bearer {{AUTH_TOKEN}}', enabled: true }]
            });
            const result = serializeToHttpFile([request]);
            assert.ok(result.includes('Bearer {{$dotenv AUTH_TOKEN}}'), 'Should transform header value');
        });

        test('should transform {{VAR}} to {{$dotenv VAR}} in body', () => {
            const request = createRequest({
                body: { type: 'json', content: '{"apiKey": "{{API_KEY}}"}' }
            });
            const result = serializeToHttpFile([request]);
            assert.ok(result.includes('{{$dotenv API_KEY}}'), 'Should transform body variable');
        });

        test('should transform {{VAR}} to {{$dotenv VAR}} in collection variables', () => {
            const request = createRequest({});
            const variables = { baseUrl: '{{BASE_URL}}' };
            const result = serializeToHttpFile([request], variables);
            assert.ok(result.includes('@baseUrl = {{$dotenv BASE_URL}}'), 'Should transform collection variable');
        });

        test('should NOT transform built-in {{$guid}} variable', () => {
            const request = createRequest({
                url: 'https://api.example.com/{{$guid}}'
            });
            const result = serializeToHttpFile([request]);
            assert.ok(result.includes('{{$guid}}'), 'Should keep $guid unchanged');
            assert.ok(!result.includes('$dotenv $guid'), 'Should not add $dotenv to $guid');
        });

        test('should NOT transform {{$timestamp}} variable', () => {
            const request = createRequest({
                url: 'https://api.example.com?t={{$timestamp}}'
            });
            const result = serializeToHttpFile([request]);
            assert.ok(result.includes('{{$timestamp}}'), 'Should keep $timestamp unchanged');
        });

        test('should NOT transform {{$randomInt}} variable', () => {
            const request = createRequest({
                url: 'https://api.example.com?r={{$randomInt}}'
            });
            const result = serializeToHttpFile([request]);
            assert.ok(result.includes('{{$randomInt}}'), 'Should keep $randomInt unchanged');
        });

        test('should NOT transform {{$dotenv VAR}} if already present', () => {
            const request = createRequest({
                url: 'https://api.example.com/{{$dotenv ALREADY_DOTENV}}'
            });
            const result = serializeToHttpFile([request]);
            // Should not double-wrap
            assert.ok(!result.includes('$dotenv $dotenv'), 'Should not double-wrap $dotenv');
            assert.ok(result.includes('{{$dotenv ALREADY_DOTENV}}'), 'Should keep original $dotenv');
        });

        test('should NOT transform request chaining syntax {{req.response.body.path}}', () => {
            const request = createRequest({
                url: 'https://api.example.com/users/{{login.response.body.userId}}'
            });
            const result = serializeToHttpFile([request]);
            assert.ok(result.includes('{{login.response.body.userId}}'), 'Should keep chaining syntax unchanged');
            assert.ok(!result.includes('$dotenv login.response.body.userId'), 'Should not add $dotenv to chaining');
        });

        test('should handle multiple variables in one line correctly', () => {
            const request = createRequest({
                url: 'https://{{HOST}}:{{PORT}}/{{$guid}}/{{login.response.body.id}}'
            });
            const result = serializeToHttpFile([request]);
            assert.ok(result.includes('{{$dotenv HOST}}'), 'Should transform HOST');
            assert.ok(result.includes('{{$dotenv PORT}}'), 'Should transform PORT');
            assert.ok(result.includes('{{$guid}}'), 'Should keep $guid unchanged');
            assert.ok(result.includes('{{login.response.body.id}}'), 'Should keep chaining unchanged');
        });
    });

    suite('Round-trip Transformation', () => {
        test('should preserve variables on round-trip (export then import)', () => {
            const request: Request = {
                id: 'test-123',
                name: 'Test Request',
                method: 'GET' as HttpMethod,
                url: 'https://{{HOST}}/api/{{PATH}}',
                headers: [
                    { name: 'Authorization', value: 'Bearer {{TOKEN}}', enabled: true }
                ],
                body: { type: 'json', content: '{"key": "{{VALUE}}"}' },
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            // Export (adds $dotenv)
            const exported = serializeToHttpFile([request]);

            // Import (removes $dotenv)
            const imported = parseHttpFile(exported);

            // Should match original. Note: Authorization header now gets converted to auth config
            assert.strictEqual(imported.requests[0].url, request.url);
            // After import, Bearer token should be in auth config, not headers
            const convertedRequest = parsedRequestToRequest(imported.requests[0]);
            assert.strictEqual(convertedRequest.auth?.type, 'bearer');
            assert.strictEqual(convertedRequest.auth?.token, '{{TOKEN}}');
            // Authorization header should be removed since it's now in auth
            assert.ok(!convertedRequest.headers.some(h => h.name === 'Authorization'));
            assert.strictEqual(imported.requests[0].body, request.body.content);
        });
    });

    suite('Auth Detection on Import', () => {
        test('should detect Bearer auth and populate auth config', () => {
            const content = `GET https://api.example.com/users
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9`;
            const parsed = parseHttpFile(content);
            const request = parsedRequestToRequest(parsed.requests[0]);

            assert.strictEqual(request.auth?.type, 'bearer');
            assert.strictEqual(request.auth?.token, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
            // Authorization header should be removed
            assert.ok(!request.headers.some(h => h.name.toLowerCase() === 'authorization'));
        });

        test('should detect Bearer auth with variable placeholder', () => {
            const content = `GET https://api.example.com/users
Authorization: Bearer {{upsTokenProd.response.body.access_token}}`;
            const parsed = parseHttpFile(content);
            const request = parsedRequestToRequest(parsed.requests[0]);

            assert.strictEqual(request.auth?.type, 'bearer');
            assert.strictEqual(request.auth?.token, '{{upsTokenProd.response.body.access_token}}');
            assert.ok(!request.headers.some(h => h.name.toLowerCase() === 'authorization'));
        });

        test('should detect Basic auth and decode credentials', () => {
            // base64("user:pass") = "dXNlcjpwYXNz"
            const content = `GET https://api.example.com/users
Authorization: Basic dXNlcjpwYXNz`;
            const parsed = parseHttpFile(content);
            const request = parsedRequestToRequest(parsed.requests[0]);

            assert.strictEqual(request.auth?.type, 'basic');
            assert.strictEqual(request.auth?.username, 'user');
            assert.strictEqual(request.auth?.password, 'pass');
            assert.ok(!request.headers.some(h => h.name.toLowerCase() === 'authorization'));
        });

        test('should handle Basic auth with variable placeholder', () => {
            const content = `GET https://api.example.com/users
Authorization: Basic {{UPS_BASIC64_CREDS}}`;
            const parsed = parseHttpFile(content);
            const request = parsedRequestToRequest(parsed.requests[0]);

            assert.strictEqual(request.auth?.type, 'basic');
            assert.strictEqual(request.auth?.username, '');
            assert.strictEqual(request.auth?.password, '{{UPS_BASIC64_CREDS}}');
            assert.ok(!request.headers.some(h => h.name.toLowerCase() === 'authorization'));
        });

        test('should preserve other headers when extracting auth', () => {
            const content = `GET https://api.example.com/users
Accept: application/json
Authorization: Bearer mytoken
Content-Type: application/json`;
            const parsed = parseHttpFile(content);
            const request = parsedRequestToRequest(parsed.requests[0]);

            assert.strictEqual(request.auth?.type, 'bearer');
            assert.strictEqual(request.headers.length, 2);
            assert.ok(request.headers.some(h => h.name === 'Accept'));
            assert.ok(request.headers.some(h => h.name === 'Content-Type'));
            assert.ok(!request.headers.some(h => h.name.toLowerCase() === 'authorization'));
        });

        test('should keep unknown auth scheme as header', () => {
            const content = `GET https://api.example.com/users
Authorization: Digest abc123`;
            const parsed = parseHttpFile(content);
            const request = parsedRequestToRequest(parsed.requests[0]);

            // Unknown auth types should remain as headers
            assert.strictEqual(request.auth, undefined);
            assert.ok(request.headers.some(h => h.name === 'Authorization'));
        });

        test('should handle case-insensitive Bearer detection', () => {
            const content = `GET https://api.example.com/users
Authorization: bearer mytoken`;
            const parsed = parseHttpFile(content);
            const request = parsedRequestToRequest(parsed.requests[0]);

            assert.strictEqual(request.auth?.type, 'bearer');
            assert.strictEqual(request.auth?.token, 'mytoken');
        });
    });
});

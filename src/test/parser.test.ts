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

            // Should match original
            assert.strictEqual(imported.requests[0].url, request.url);
            assert.strictEqual(imported.requests[0].headers[0].value, request.headers[0].value);
            assert.strictEqual(imported.requests[0].body, request.body.content);
        });
    });
});

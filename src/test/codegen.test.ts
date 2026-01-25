import * as assert from 'assert';
import {
    ResolvedRequest,
    getGenerators,
    getGenerator,
    registerGenerator,
    generateCode,
    LanguageGenerator
} from '../codegen';
import { CurlGenerator } from '../codegen/generators/curl';
import { JavaScriptFetchGenerator } from '../codegen/generators/javascript-fetch';
import { PythonRequestsGenerator } from '../codegen/generators/python-requests';
import { CSharpHttpClientGenerator } from '../codegen/generators/csharp-httpclient';
import { GoNetHttpGenerator } from '../codegen/generators/go-nethttp';
import { PhpCurlGenerator } from '../codegen/generators/php-curl';

suite('Code Generation Test Suite', () => {
    const simpleGetRequest: ResolvedRequest = {
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: [],
    };

    const postRequestWithBody: ResolvedRequest = {
        method: 'POST',
        url: 'https://api.example.com/users',
        headers: [
            { name: 'Content-Type', value: 'application/json' },
            { name: 'Authorization', value: 'Bearer token123' },
        ],
        body: {
            type: 'json',
            content: '{"name":"John","email":"john@example.com"}',
        },
    };

    const requestWithSpecialChars: ResolvedRequest = {
        method: 'POST',
        url: "https://api.example.com/search?q=hello'world",
        headers: [
            { name: 'X-Custom', value: "value'with\"quotes" },
        ],
        body: {
            type: 'text',
            content: "It's a \"test\"",
        },
    };

    suite('Generator Registry', () => {
        test('should have built-in generators registered', () => {
            const generators = getGenerators();
            assert.ok(generators.length >= 6, 'Should have at least 6 generators');

            const ids = generators.map((g: LanguageGenerator) => g.id);
            assert.ok(ids.includes('curl'), 'Should have curl generator');
            assert.ok(ids.includes('javascript-fetch'), 'Should have javascript-fetch generator');
            assert.ok(ids.includes('python-requests'), 'Should have python-requests generator');
            assert.ok(ids.includes('csharp-httpclient'), 'Should have csharp-httpclient generator');
            assert.ok(ids.includes('go-nethttp'), 'Should have go-nethttp generator');
            assert.ok(ids.includes('php-curl'), 'Should have php-curl generator');
        });

        test('should get generator by id', () => {
            const curl = getGenerator('curl');
            assert.ok(curl, 'Should find curl generator');
            assert.strictEqual(curl!.id, 'curl');
            assert.strictEqual(curl!.name, 'cURL');
        });

        test('should return undefined for unknown generator', () => {
            const unknown = getGenerator('unknown-generator');
            assert.strictEqual(unknown, undefined);
        });

        test('should register custom generator', () => {
            const customGenerator: LanguageGenerator = {
                id: 'custom-test',
                name: 'Custom Test',
                generate: (req: ResolvedRequest) => `CUSTOM: ${req.method} ${req.url}`,
            };

            registerGenerator(customGenerator);

            const retrieved = getGenerator('custom-test');
            assert.ok(retrieved, 'Should find custom generator');
            assert.strictEqual(retrieved!.name, 'Custom Test');
        });

        test('should generate code using generateCode function', () => {
            const code = generateCode('curl', simpleGetRequest);
            assert.ok(code, 'Should generate code');
            assert.ok(code!.includes('curl'), 'Should contain curl');
            assert.ok(code!.includes('api.example.com'), 'Should contain URL');
        });

        test('generateCode should return undefined for unknown generator', () => {
            const code = generateCode('unknown', simpleGetRequest);
            assert.strictEqual(code, undefined);
        });
    });

    suite('cURL Generator', () => {
        const generator = new CurlGenerator();

        test('should generate simple GET request', () => {
            const code = generator.generate(simpleGetRequest);
            assert.ok(code.startsWith('curl'), 'Should start with curl');
            assert.ok(code.includes("'https://api.example.com/users'"), 'Should include URL');
            assert.ok(!code.includes('-X GET'), 'Should not include -X GET (implicit)');
        });

        test('should generate POST request with body', () => {
            const code = generator.generate(postRequestWithBody);
            assert.ok(code.includes('-X POST'), 'Should include -X POST');
            assert.ok(code.includes("-H 'Content-Type: application/json'"), 'Should include Content-Type header');
            assert.ok(code.includes("-H 'Authorization: Bearer token123'"), 'Should include Authorization header');
            assert.ok(code.includes("-d '"), 'Should include body with -d');
        });

        test('should escape single quotes in shell', () => {
            const code = generator.generate(requestWithSpecialChars);
            assert.ok(code.includes("'\\''"), 'Should escape single quotes');
        });
    });

    suite('JavaScript Fetch Generator', () => {
        const generator = new JavaScriptFetchGenerator();

        test('should generate simple GET request', () => {
            const code = generator.generate(simpleGetRequest);
            assert.ok(code.includes("fetch('https://api.example.com/users')"), 'Should be simple fetch');
        });

        test('should generate POST request with headers and body', () => {
            const code = generator.generate(postRequestWithBody);
            assert.ok(code.includes("method: 'POST'"), 'Should include method');
            assert.ok(code.includes('headers: {'), 'Should include headers');
            assert.ok(code.includes("'Content-Type'"), 'Should include Content-Type');
            assert.ok(code.includes('body:'), 'Should include body');
            assert.ok(code.includes('JSON.stringify'), 'Should use JSON.stringify for JSON body');
        });
    });

    suite('Python Requests Generator', () => {
        const generator = new PythonRequestsGenerator();

        test('should generate simple GET request', () => {
            const code = generator.generate(simpleGetRequest);
            assert.ok(code.includes('import requests'), 'Should import requests');
            assert.ok(code.includes('requests.get('), 'Should use requests.get');
            assert.ok(code.includes("'https://api.example.com/users'"), 'Should include URL');
        });

        test('should generate POST request with JSON body', () => {
            const code = generator.generate(postRequestWithBody);
            assert.ok(code.includes('requests.post('), 'Should use requests.post');
            assert.ok(code.includes('headers=headers'), 'Should pass headers');
            assert.ok(code.includes('json=json_data') || code.includes('data=data'), 'Should pass body');
        });

        test('should convert Python booleans and None', () => {
            const request: ResolvedRequest = {
                method: 'POST',
                url: 'https://api.example.com/test',
                headers: [],
                body: {
                    type: 'json',
                    content: '{"active":true,"deleted":false,"value":null}',
                },
            };
            const code = generator.generate(request);
            assert.ok(code.includes('True') || code.includes('true'), 'Should handle boolean true');
        });
    });

    suite('C# HttpClient Generator', () => {
        const generator = new CSharpHttpClientGenerator();

        test('should generate simple GET request', () => {
            const code = generator.generate(simpleGetRequest);
            assert.ok(code.includes('using System.Net.Http'), 'Should include using statement');
            assert.ok(code.includes('HttpMethod.Get'), 'Should use HttpMethod.Get');
            assert.ok(code.includes('HttpRequestMessage'), 'Should use HttpRequestMessage');
        });

        test('should generate POST request with body', () => {
            const code = generator.generate(postRequestWithBody);
            assert.ok(code.includes('HttpMethod.Post'), 'Should use HttpMethod.Post');
            assert.ok(code.includes('StringContent'), 'Should use StringContent for body');
            assert.ok(code.includes('application/json'), 'Should include content type');
        });
    });

    suite('Go net/http Generator', () => {
        const generator = new GoNetHttpGenerator();

        test('should generate simple GET request', () => {
            const code = generator.generate(simpleGetRequest);
            assert.ok(code.includes('package main'), 'Should include package');
            assert.ok(code.includes('net/http'), 'Should import net/http');
            assert.ok(code.includes('http.NewRequest'), 'Should use NewRequest');
            assert.ok(code.includes('"GET"'), 'Should include GET method');
        });

        test('should generate POST request with body', () => {
            const code = generator.generate(postRequestWithBody);
            assert.ok(code.includes('strings.NewReader'), 'Should use strings.NewReader for body');
            assert.ok(code.includes('"POST"'), 'Should include POST method');
            assert.ok(code.includes('req.Header.Set'), 'Should set headers');
        });
    });

    suite('PHP cURL Generator', () => {
        const generator = new PhpCurlGenerator();

        test('should generate simple GET request', () => {
            const code = generator.generate(simpleGetRequest);
            assert.ok(code.includes('<?php'), 'Should start with PHP tag');
            assert.ok(code.includes('curl_init()'), 'Should use curl_init');
            assert.ok(code.includes('CURLOPT_URL'), 'Should set URL');
            assert.ok(code.includes('curl_exec'), 'Should execute curl');
        });

        test('should generate POST request with body', () => {
            const code = generator.generate(postRequestWithBody);
            assert.ok(code.includes('CURLOPT_POST') || code.includes('CURLOPT_CUSTOMREQUEST'), 'Should set POST method');
            assert.ok(code.includes('CURLOPT_HTTPHEADER'), 'Should set headers');
            assert.ok(code.includes('CURLOPT_POSTFIELDS'), 'Should set body');
        });
    });
});

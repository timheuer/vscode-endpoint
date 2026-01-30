import * as assert from 'assert';
import { resolveVariables } from '../parser/VariableResolver';

suite('Variable Resolver Test Suite', () => {

    suite('Built-in Variables Without Parameters', () => {
        test('should resolve {{$timestamp}}', () => {
            const result = resolveVariables('{{$timestamp}}', {});
            // Should be a valid ISO 8601 timestamp
            assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result));
        });

        test('should resolve {{$guid}}', () => {
            const result = resolveVariables('{{$guid}}', {});
            // Should be a valid UUID v4 format
            assert.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result));
        });

        test('should resolve {{$randomint}} without parameters', () => {
            const result = resolveVariables('{{$randomint}}', {});
            const num = parseInt(result, 10);
            assert.ok(!isNaN(num), 'Should be a valid number');
            assert.ok(num >= 0 && num < 1000000, 'Should be in default range 0-999999');
        });

        test('should resolve {{$date}}', () => {
            const result = resolveVariables('{{$date}}', {});
            // Should be YYYY-MM-DD format
            assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(result));
        });

        test('should resolve {{$time}}', () => {
            const result = resolveVariables('{{$time}}', {});
            // Should be HH:MM:SS format
            assert.ok(/^\d{2}:\d{2}:\d{2}$/.test(result));
        });
    });

    suite('$randomInt with Parameters', () => {
        test('should resolve {{$randomInt 1 100}} within range', () => {
            const result = resolveVariables('{{$randomInt 1 100}}', {});
            const num = parseInt(result, 10);
            assert.ok(!isNaN(num), 'Should be a valid number');
            assert.ok(num >= 1 && num <= 100, `Should be between 1 and 100, got ${num}`);
        });

        test('should resolve {{$randomInt 50 50}} to exact value', () => {
            const result = resolveVariables('{{$randomInt 50 50}}', {});
            assert.strictEqual(result, '50', 'Should return exact value when min equals max');
        });

        test('should resolve {{$randomInt 1000 9999}} for 4-digit range', () => {
            const result = resolveVariables('{{$randomInt 1000 9999}}', {});
            const num = parseInt(result, 10);
            assert.ok(num >= 1000 && num <= 9999, `Should be 4-digit number, got ${num}`);
        });

        test('should handle negative ranges {{$randomInt -100 -1}}', () => {
            const result = resolveVariables('{{$randomInt -100 -1}}', {});
            const num = parseInt(result, 10);
            assert.ok(num >= -100 && num <= -1, `Should be between -100 and -1, got ${num}`);
        });

        test('should handle range spanning zero {{$randomInt -10 10}}', () => {
            const result = resolveVariables('{{$randomInt -10 10}}', {});
            const num = parseInt(result, 10);
            assert.ok(num >= -10 && num <= 10, `Should be between -10 and 10, got ${num}`);
        });

        test('should swap min and max if reversed {{$randomInt 100 1}}', () => {
            const result = resolveVariables('{{$randomInt 100 1}}', {});
            const num = parseInt(result, 10);
            assert.ok(num >= 1 && num <= 100, `Should swap and be between 1 and 100, got ${num}`);
        });

        test('should handle case-insensitive {{$RANDOMINT 1 100}}', () => {
            const result = resolveVariables('{{$RANDOMINT 1 100}}', {});
            const num = parseInt(result, 10);
            assert.ok(num >= 1 && num <= 100, 'Should work with uppercase');
        });

        test('should fallback to default when min/max invalid', () => {
            const result = resolveVariables('{{$randomInt abc def}}', {});
            const num = parseInt(result, 10);
            assert.ok(num >= 0 && num < 1000000, 'Should fallback to default range');
        });

        test('should fallback to default when only one param', () => {
            const result = resolveVariables('{{$randomInt 100}}', {});
            const num = parseInt(result, 10);
            assert.ok(num >= 0 && num < 1000000, 'Should fallback to default range');
        });
    });

    suite('$timestamp with Offset Parameters', () => {
        test('should resolve {{$timestamp -1 d}} for yesterday', () => {
            const now = new Date();
            const result = resolveVariables('{{$timestamp -1 d}}', {});
            const resultDate = new Date(result);
            
            const diffMs = now.getTime() - resultDate.getTime();
            const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
            
            assert.ok(diffDays === 1, `Should be 1 day ago, got ${diffDays} days difference`);
        });

        test('should resolve {{$timestamp 2 h}} for 2 hours from now', () => {
            const now = new Date();
            const result = resolveVariables('{{$timestamp 2 h}}', {});
            const resultDate = new Date(result);
            
            const diffMs = resultDate.getTime() - now.getTime();
            const diffHours = diffMs / (1000 * 60 * 60);
            
            assert.ok(diffHours >= 1.9 && diffHours <= 2.1, `Should be ~2 hours from now, got ${diffHours}`);
        });

        test('should resolve {{$timestamp -30 m}} for 30 minutes ago', () => {
            const now = new Date();
            const result = resolveVariables('{{$timestamp -30 m}}', {});
            const resultDate = new Date(result);
            
            const diffMs = now.getTime() - resultDate.getTime();
            const diffMinutes = diffMs / (1000 * 60);
            
            assert.ok(diffMinutes >= 29 && diffMinutes <= 31, `Should be ~30 minutes ago, got ${diffMinutes}`);
        });

        test('should resolve {{$timestamp 7 d}} for next week', () => {
            const now = new Date();
            const result = resolveVariables('{{$timestamp 7 d}}', {});
            const resultDate = new Date(result);
            
            const diffMs = resultDate.getTime() - now.getTime();
            const diffDays = diffMs / (1000 * 60 * 60 * 24);
            
            assert.ok(diffDays >= 6.9 && diffDays <= 7.1, `Should be ~7 days from now, got ${diffDays}`);
        });

        test('should resolve {{$timestamp 1 w}} for next week using week unit', () => {
            const now = new Date();
            const result = resolveVariables('{{$timestamp 1 w}}', {});
            const resultDate = new Date(result);
            
            const diffMs = resultDate.getTime() - now.getTime();
            const diffDays = diffMs / (1000 * 60 * 60 * 24);
            
            assert.ok(diffDays >= 6.9 && diffDays <= 7.1, `Should be ~7 days from now, got ${diffDays}`);
        });

        test('should resolve {{$timestamp 60 s}} for 60 seconds from now', () => {
            const now = new Date();
            const result = resolveVariables('{{$timestamp 60 s}}', {});
            const resultDate = new Date(result);
            
            const diffMs = resultDate.getTime() - now.getTime();
            const diffSeconds = diffMs / 1000;
            
            assert.ok(diffSeconds >= 59 && diffSeconds <= 61, `Should be ~60 seconds from now, got ${diffSeconds}`);
        });

        test('should resolve {{$date -1 d}} for yesterday date', () => {
            const now = new Date();
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            
            const result = resolveVariables('{{$date -1 d}}', {});
            const expected = yesterday.toISOString().split('T')[0];
            
            assert.strictEqual(result, expected, 'Should return yesterday\'s date');
        });

        test('should resolve {{$time 1 h}} for time 1 hour from now', () => {
            const result = resolveVariables('{{$time 1 h}}', {});
            // Should be HH:MM:SS format
            assert.ok(/^\d{2}:\d{2}:\d{2}$/.test(result), 'Should be in HH:MM:SS format');
        });

        test('should resolve {{$timestamp_unix -1 d}} for yesterday Unix timestamp', () => {
            const now = new Date();
            const result = resolveVariables('{{$timestamp_unix -1 d}}', {});
            const timestamp = parseInt(result, 10);
            
            const expectedTimestamp = Math.floor((now.getTime() - 24 * 60 * 60 * 1000) / 1000);
            const diff = Math.abs(timestamp - expectedTimestamp);
            
            assert.ok(diff <= 2, `Should be ~yesterday's Unix timestamp, diff: ${diff} seconds`);
        });

        test('should resolve {{$unix 2 h}} for 2 hours from now Unix timestamp', () => {
            const now = new Date();
            const result = resolveVariables('{{$unix 2 h}}', {});
            const timestamp = parseInt(result, 10);
            
            const expectedTimestamp = Math.floor((now.getTime() + 2 * 60 * 60 * 1000) / 1000);
            const diff = Math.abs(timestamp - expectedTimestamp);
            
            assert.ok(diff <= 2, `Should be ~2 hours from now Unix timestamp, diff: ${diff} seconds`);
        });
    });

    suite('$localDatetime Variable', () => {
        test('should resolve {{$localDatetime}} with default ISO format', () => {
            const result = resolveVariables('{{$localDatetime}}', {});
            // Should be ISO format with timezone offset
            assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/.test(result));
        });

        test('should resolve {{$localDatetime iso8601}} explicitly', () => {
            const result = resolveVariables('{{$localDatetime iso8601}}', {});
            assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/.test(result));
        });

        test('should resolve {{$localDatetime rfc1123}} format', () => {
            const result = resolveVariables('{{$localDatetime rfc1123}}', {});
            // RFC 1123 format: "Day, DD Mon YYYY HH:MM:SS GMT"
            assert.ok(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(result));
        });

        test('should resolve {{$localDatetime -1 d}} with offset', () => {
            const result = resolveVariables('{{$localDatetime -1 d}}', {});
            assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/.test(result));
        });

        test('should resolve {{$localDatetime rfc1123 -1 d}} with format and offset', () => {
            const result = resolveVariables('{{$localDatetime rfc1123 -1 d}}', {});
            assert.ok(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(result));
        });

        test('should handle case-insensitive format {{$localDatetime RFC1123}}', () => {
            const result = resolveVariables('{{$localDatetime RFC1123}}', {});
            assert.ok(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(result), 'Should handle uppercase format');
        });

        test('should handle case-insensitive format {{$localDatetime ISO8601}}', () => {
            const result = resolveVariables('{{$localDatetime ISO8601}}', {});
            assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/.test(result), 'Should handle uppercase format');
        });
    });

    suite('Multiple Variables in Text', () => {
        test('should resolve multiple different variables', () => {
            const text = 'ID={{$randomInt 1 100}}&timestamp={{$timestamp}}&guid={{$guid}}';
            const result = resolveVariables(text, {});
            
            assert.ok(/ID=\d+/.test(result), 'Should contain random int');
            assert.ok(/timestamp=\d{4}-\d{2}-\d{2}T/.test(result), 'Should contain timestamp');
            assert.ok(/guid=[0-9a-f-]+/.test(result), 'Should contain guid');
        });

        test('should resolve same variable multiple times', () => {
            const text = '{{$randomInt 1 10}}-{{$randomInt 1 10}}-{{$randomInt 1 10}}';
            const result = resolveVariables(text, {});
            
            const parts = result.split('-');
            assert.strictEqual(parts.length, 3, 'Should have 3 parts');
            parts.forEach(part => {
                const num = parseInt(part, 10);
                assert.ok(num >= 1 && num <= 10, `Each part should be 1-10, got ${num}`);
            });
        });
    });

    suite('Edge Cases', () => {
        test('should handle extra whitespace in parameters', () => {
            const result = resolveVariables('{{$randomInt  1   100 }}', {});
            const num = parseInt(result, 10);
            assert.ok(num >= 1 && num <= 100, 'Should handle extra spaces');
        });

        test('should handle text without variables', () => {
            const text = 'Hello, World!';
            const result = resolveVariables(text, {});
            assert.strictEqual(result, text, 'Should return unchanged');
        });

        test('should preserve unresolved variables', () => {
            const text = '{{UNKNOWN_VAR}}';
            const result = resolveVariables(text, {});
            assert.strictEqual(result, text, 'Should keep unresolved variables');
        });

        test('should mix resolved and unresolved variables', () => {
            const text = '{{$randomInt 1 10}}-{{UNKNOWN}}-{{$guid}}';
            const result = resolveVariables(text, {});
            
            assert.ok(/^\d+-\{\{UNKNOWN\}\}-[0-9a-f-]+$/i.test(result), 'Should resolve known, keep unknown');
        });
    });

    suite('Variable Precedence', () => {
        test('should prefer provided variable over built-in', () => {
            const result = resolveVariables('{{$timestamp}}', { '$timestamp': 'my-custom-timestamp' });
            assert.strictEqual(result, 'my-custom-timestamp', 'Should use provided variable');
        });

        test('should use built-in when not in provided variables', () => {
            const result = resolveVariables('{{$timestamp}}', { 'other': 'value' });
            assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(result), 'Should use built-in');
        });
    });
});

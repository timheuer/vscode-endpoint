import { ResolvedRequest, LanguageGenerator } from './types';
import { CurlGenerator } from './generators/curl';
import { JavaScriptFetchGenerator } from './generators/javascript-fetch';
import { PythonRequestsGenerator } from './generators/python-requests';
import { CSharpHttpClientGenerator } from './generators/csharp-httpclient';
import { GoNetHttpGenerator } from './generators/go-nethttp';
import { PhpCurlGenerator } from './generators/php-curl';

export * from './types';

const generators: Map<string, LanguageGenerator> = new Map();

// Register built-in generators
const builtInGenerators: LanguageGenerator[] = [
    new CurlGenerator(),
    new JavaScriptFetchGenerator(),
    new PythonRequestsGenerator(),
    new CSharpHttpClientGenerator(),
    new GoNetHttpGenerator(),
    new PhpCurlGenerator(),
];

for (const generator of builtInGenerators) {
    generators.set(generator.id, generator);
}

/**
 * Get all registered generators
 */
export function getGenerators(): LanguageGenerator[] {
    return Array.from(generators.values());
}

/**
 * Get a generator by ID
 */
export function getGenerator(id: string): LanguageGenerator | undefined {
    return generators.get(id);
}

/**
 * Register a custom generator (for extensibility)
 */
export function registerGenerator(generator: LanguageGenerator): void {
    generators.set(generator.id, generator);
}

/**
 * Generate code for a request using the specified generator
 */
export function generateCode(generatorId: string, request: ResolvedRequest): string | undefined {
    const generator = generators.get(generatorId);
    if (!generator) {
        return undefined;
    }
    return generator.generate(request);
}

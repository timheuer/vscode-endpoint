export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type AuthType = 'none' | 'basic' | 'bearer' | 'apikey';

export interface RequestHeader {
    name: string;
    value: string;
    enabled: boolean;
}

export interface RequestBody {
    type: 'none' | 'json' | 'form' | 'text' | 'xml';
    content: string;
}

export interface AuthConfig {
    type: AuthType;
    username?: string;
    password?: string;
    token?: string;
    apiKeyName?: string;
    apiKeyValue?: string;
    apiKeyIn?: 'header' | 'query';
}

export interface Request {
    id: string;
    name: string;
    method: HttpMethod;
    url: string;
    headers: RequestHeader[];
    body: RequestBody;
    auth?: AuthConfig;
    disabledInheritedHeaders?: string[];
    preRequestId?: string;
    createdAt: number;
    updatedAt: number;
}

export interface Collection {
    id: string;
    name: string;
    description?: string;
    requests: Request[];
    variables?: Record<string, string>;
    defaultHeaders?: RequestHeader[];
    defaultAuth?: AuthConfig;
    createdAt: number;
    updatedAt: number;
}

export function createRequest(name: string, method: HttpMethod = 'GET', url: string = '', auth?: AuthConfig): Request {
    const now = Date.now();
    return {
        id: generateId(),
        name,
        method,
        url,
        headers: [],
        body: { type: 'none', content: '' },
        auth,
        createdAt: now,
        updatedAt: now,
    };
}

export function createCollection(name: string, description?: string): Collection {
    const now = Date.now();
    return {
        id: generateId(),
        name,
        description,
        requests: [],
        createdAt: now,
        updatedAt: now,
    };
}

function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

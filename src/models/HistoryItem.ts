import { HttpMethod, RequestHeader, RequestBody } from './Collection';

export interface HistoryItem {
    id: string;
    method: HttpMethod;
    url: string;
    headers: RequestHeader[];
    body: RequestBody;
    statusCode?: number;
    statusText?: string;
    responseTime?: number;
    timestamp: number;
    responseBody?: string;
    responseHeaders?: RequestHeader[];
    sourceRequestId?: string;
    sourceCollectionId?: string;
    responseBodyTruncated?: boolean;
}

export function createHistoryItem(
    method: HttpMethod,
    url: string,
    headers: RequestHeader[] = [],
    body: RequestBody = { type: 'none', content: '' }
): HistoryItem {
    return {
        id: generateId(),
        method,
        url,
        headers,
        body,
        timestamp: Date.now(),
    };
}

function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

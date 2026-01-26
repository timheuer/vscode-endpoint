import * as http from 'http';
import * as https from 'https';
import * as zlib from 'zlib';
import { URL } from 'url';
import { Request, RequestHeader } from '../models/Collection';
import { HttpResponse } from './ResponseContentProvider';
import { getLogger } from '../logger';
import { getSettings } from '../settings';

export interface HttpClientOptions {
    timeout?: number;
    followRedirects?: boolean;
    maxRedirects?: number;
    rejectUnauthorized?: boolean;
}

/**
 * Get default options from VS Code settings
 */
function getDefaultOptions(): Required<HttpClientOptions> {
    const settings = getSettings();
    return {
        timeout: settings.timeout,
        followRedirects: settings.followRedirects,
        maxRedirects: settings.maxRedirects,
        rejectUnauthorized: settings.rejectUnauthorized,
    };
}

/**
 * HTTP Client using Node.js native http/https modules
 */
export class HttpClient {
    private options: Required<HttpClientOptions>;

    constructor(options: HttpClientOptions = {}) {
        this.options = { ...getDefaultOptions(), ...options };
    }

    /**
     * Execute an HTTP request and return the response
     */
    async executeRequest(request: Request, additionalHeaders?: Record<string, string>): Promise<HttpResponse> {
        return this.executeWithRedirects(request, additionalHeaders, 0);
    }

    private async executeWithRedirects(
        request: Request,
        additionalHeaders?: Record<string, string>,
        redirectCount: number = 0
    ): Promise<HttpResponse> {
        const logger = getLogger();
        const startTime = Date.now();

        // Parse URL
        let url: URL;
        try {
            url = new URL(request.url);
        } catch (error) {
            logger.error('Invalid URL', { url: request.url });
            throw new Error(`Invalid URL: ${request.url}`);
        }

        logger.info('Executing HTTP request', { method: request.method, url: request.url });
        logger.debug('Request headers', { headers: request.headers.filter(h => h.enabled).map(h => h.name) });

        // Build headers
        const headers: Record<string, string> = {};

        // Add enabled request headers
        for (const header of request.headers) {
            if (header.enabled) {
                headers[header.name] = header.value;
            }
        }

        // Add additional headers (from auth, etc.)
        if (additionalHeaders) {
            Object.assign(headers, additionalHeaders);
        }

        // Add Accept-Encoding for compression support if not set
        if (!headers['Accept-Encoding'] && !headers['accept-encoding']) {
            headers['Accept-Encoding'] = 'gzip, deflate';
        }

        // Build request body
        let body: string | undefined;
        if (request.body && request.body.type !== 'none' && request.body.content) {
            body = request.body.content;

            // Set Content-Type if not already set
            if (!headers['Content-Type'] && !headers['content-type']) {
                switch (request.body.type) {
                    case 'json':
                        headers['Content-Type'] = 'application/json';
                        break;
                    case 'form':
                        headers['Content-Type'] = 'application/x-www-form-urlencoded';
                        break;
                    case 'xml':
                        headers['Content-Type'] = 'application/xml';
                        break;
                    case 'text':
                        headers['Content-Type'] = 'text/plain';
                        break;
                }
            }

            // Set Content-Length
            if (body && !headers['Content-Length'] && !headers['content-length']) {
                headers['Content-Length'] = Buffer.byteLength(body, 'utf8').toString();
            }
        }

        // Build request options
        const isHttps = url.protocol === 'https:';
        const requestOptions: http.RequestOptions | https.RequestOptions = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method: request.method,
            headers: headers,
            timeout: this.options.timeout,
        };

        // HTTPS specific options
        if (isHttps) {
            (requestOptions as https.RequestOptions).rejectUnauthorized = this.options.rejectUnauthorized;
        }

        return new Promise((resolve, reject) => {
            const client = isHttps ? https : http;

            const req = client.request(requestOptions, (res) => {
                const chunks: Buffer[] = [];

                res.on('data', (chunk: Buffer) => {
                    chunks.push(chunk);
                });

                res.on('end', async () => {
                    const endTime = Date.now();
                    const responseTime = endTime - startTime;

                    // Handle redirects
                    if (this.options.followRedirects &&
                        res.statusCode &&
                        [301, 302, 303, 307, 308].includes(res.statusCode) &&
                        res.headers.location) {

                        if (redirectCount >= this.options.maxRedirects) {
                            logger.error('Maximum redirects exceeded', { maxRedirects: this.options.maxRedirects });
                            reject(new Error(`Maximum redirects (${this.options.maxRedirects}) exceeded`));
                            return;
                        }

                        logger.debug('Following redirect', {
                            statusCode: res.statusCode,
                            location: res.headers.location,
                            redirectCount: redirectCount + 1
                        });

                        // Build redirect URL
                        const redirectUrl = new URL(res.headers.location, url);
                        const redirectRequest: Request = {
                            ...request,
                            url: redirectUrl.toString(),
                            // For 303, change method to GET
                            method: res.statusCode === 303 ? 'GET' : request.method,
                        };

                        // Clear body for GET requests on redirect
                        if (res.statusCode === 303) {
                            redirectRequest.body = { type: 'none', content: '' };
                        }

                        try {
                            const redirectResponse = await this.executeWithRedirects(
                                redirectRequest,
                                additionalHeaders,
                                redirectCount + 1
                            );
                            resolve(redirectResponse);
                        } catch (error) {
                            reject(error);
                        }
                        return;
                    }

                    // Combine chunks
                    const rawBuffer = Buffer.concat(chunks);
                    const rawSize = rawBuffer.length;

                    // Decompress if needed
                    let bodyBuffer: Buffer;
                    const contentEncoding = res.headers['content-encoding'];

                    try {
                        if (contentEncoding === 'gzip') {
                            bodyBuffer = await this.decompressGzip(rawBuffer);
                        } else if (contentEncoding === 'deflate') {
                            bodyBuffer = await this.decompressDeflate(rawBuffer);
                        } else {
                            bodyBuffer = rawBuffer;
                        }
                    } catch (decompressError) {
                        // If decompression fails, use raw buffer
                        bodyBuffer = rawBuffer;
                    }

                    // Decode body as string
                    const charset = this.getCharset(res.headers['content-type']) || 'utf-8';
                    let bodyString: string;
                    try {
                        bodyString = bodyBuffer.toString(charset as BufferEncoding);
                    } catch {
                        bodyString = bodyBuffer.toString('utf-8');
                    }

                    // Build response headers
                    const responseHeaders: Record<string, string> = {};
                    for (const [key, value] of Object.entries(res.headers)) {
                        if (value !== undefined) {
                            responseHeaders[key] = Array.isArray(value) ? value.join(', ') : value;
                        }
                    }

                    const response: HttpResponse = {
                        status: res.statusCode || 0,
                        statusText: res.statusMessage || '',
                        headers: responseHeaders,
                        body: bodyString,
                        time: responseTime,
                        size: rawSize,
                    };

                    logger.info('HTTP request completed', {
                        status: response.status,
                        time: responseTime + 'ms',
                        size: rawSize + ' bytes'
                    });
                    // Mask sensitive values in trace output
                    const maskedBody = bodyString
                        .replace(/"(access_token|token|refresh_token|id_token|bearer|api_key|apikey|secret|password|authorization)"\s*:\s*"[^"]+"/gi, '"$1": "[MASKED]"')
                        .replace(/(Bearer\s+)[A-Za-z0-9\-_]+\.?[A-Za-z0-9\-_]*\.?[A-Za-z0-9\-_]*/gi, '$1[MASKED]');
                    logger.trace('Response body preview', {
                        body: maskedBody.substring(0, 500) + (maskedBody.length > 500 ? '...' : '')
                    });

                    resolve(response);
                });

                res.on('error', (error) => {
                    logger.error('Response error', { error: error.message });
                    reject(new Error(`Response error: ${error.message}`));
                });
            });

            req.on('error', (error) => {
                logger.error('Request error', { error: error.message });
                reject(new Error(`Request error: ${error.message}`));
            });

            req.on('timeout', () => {
                logger.error('Request timeout', { timeout: this.options.timeout });
                req.destroy();
                reject(new Error(`Request timed out after ${this.options.timeout}ms`));
            });

            // Send body if present
            if (body) {
                req.write(body);
            }

            req.end();
        });
    }

    /**
     * Execute a raw request with resolved values (URL, headers, body already resolved)
     */
    async executeRaw(
        method: string,
        url: string,
        headers: Record<string, string>,
        body?: string
    ): Promise<HttpResponse> {
        const request: Request = {
            id: 'raw-request',
            name: 'Raw Request',
            method: method as any,
            url: url,
            headers: Object.entries(headers).map(([name, value]) => ({
                name,
                value,
                enabled: true,
            })),
            body: body ? { type: 'text', content: body } : { type: 'none', content: '' },
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        return this.executeRequest(request);
    }

    private decompressGzip(buffer: Buffer): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            zlib.gunzip(buffer, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            });
        });
    }

    private decompressDeflate(buffer: Buffer): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            zlib.inflate(buffer, (err, result) => {
                if (err) {
                    // Try raw deflate if regular deflate fails
                    zlib.inflateRaw(buffer, (err2, result2) => {
                        if (err2) {
                            reject(err);
                        } else {
                            resolve(result2);
                        }
                    });
                } else {
                    resolve(result);
                }
            });
        });
    }

    private getCharset(contentType: string | undefined): string | undefined {
        if (!contentType) {
            return undefined;
        }
        const match = contentType.match(/charset=([^;]+)/i);
        return match ? match[1].trim().toLowerCase() : undefined;
    }

    /**
     * Update client options
     */
    setOptions(options: HttpClientOptions): void {
        this.options = { ...this.options, ...options };
    }

    /**
     * Get current options
     */
    getOptions(): Required<HttpClientOptions> {
        return { ...this.options };
    }
}

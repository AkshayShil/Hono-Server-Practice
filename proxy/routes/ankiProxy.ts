import { Hono } from 'hono';
import http from 'http';

export const ankiProxy = new Hono();

ankiProxy.all('/*', async (c) => {
  const subpath = c.req.path.replace(/^\/anki\/?/, '');
  const targetUrl = `http://127.0.0.1:8765/${subpath}`;
  
  // Extract info for the http request
  const url = new URL(targetUrl);
  const method = c.req.method;
  
  const headers: Record<string, string> = {};
  if (c.req.header('Content-Type')) {
    headers['Content-Type'] = 'application/json';
  }
  
  // Anki-Connect expects application/json for POST requests
  if (c.req.header('Origin')) {
    headers['Origin'] = c.req.header('Origin') || 'http://localhost';
  }
  
  // Explicitly disable keep-alive to avoid 'other side closed' issues
  headers['Connection'] = 'close';

  try {
    const bodyBuffer = method !== 'GET' && method !== 'HEAD' 
      ? Buffer.from(await c.req.raw.arrayBuffer())
      : null;

    if (bodyBuffer) {
      headers['Content-Length'] = bodyBuffer.length.toString();
    }

    return new Promise((resolve) => {
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: method,
        headers: headers
      };

      const req = http.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const responseData = Buffer.concat(chunks);
          
          const resHeaders = new Headers();
          for (const [key, value] of Object.entries(res.headers)) {
            if (value === undefined) continue;
            if (Array.isArray(value)) {
              value.forEach(v => resHeaders.append(key, v));
            } else {
              resHeaders.set(key, value);
            }
          }
          
          // Clean up headers that might cause issues
          resHeaders.delete('content-encoding');
          resHeaders.delete('transfer-encoding');
          resHeaders.delete('access-control-allow-origin');
          resHeaders.delete('access-control-allow-headers');
          resHeaders.delete('access-control-allow-methods');

          resolve(new Response(responseData, {
            status: res.statusCode,
            headers: resHeaders,
          }));
        });
      });

      req.on('error', (err) => {
        console.error('[AnkiProxy Request Error]', err);
        resolve(c.json({ error: 'Anki-Connect unreachable', details: err.message }, 503));
      });

      if (bodyBuffer) {
        req.write(bodyBuffer);
      }
      req.end();
    });
  } catch (error) {
    const err = error as Error;
    console.error(`[AnkiProxy Fatal Error] ${err.message}`, err);
    return c.json({ error: 'Proxy internal error', details: err.message }, 500);
  }
});

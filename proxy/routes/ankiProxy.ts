import { Hono } from 'hono';

export const ankiProxy = new Hono();

ankiProxy.all('/*', async (c) => {
  const subpath = c.req.path.replace(/^\/anki\/?/, '');
  const targetUrl = `http://127.0.0.1:8765/${subpath}`;
  
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  headers.set('Origin', 'http://localhost');
  headers.set('Host', '127.0.0.1:8765');

  try {
    const body = c.req.method !== 'GET' && c.req.method !== 'HEAD' 
      ? await c.req.raw.arrayBuffer() 
      : undefined;

    const response = await fetch(targetUrl, {
      method: c.req.method,
      headers: headers,
      body: body,
      // @ts-ignore - node-fetch specific or newer fetch options
      duplex: body ? 'half' : undefined 
    });

    const resHeaders = new Headers(response.headers);
    resHeaders.delete('content-encoding');
    resHeaders.delete('transfer-encoding');
    resHeaders.delete('access-control-allow-origin');
    resHeaders.delete('access-control-allow-headers');
    resHeaders.delete('access-control-allow-methods');

    return new Response(response.body, {
      status: response.status,
      headers: resHeaders,
    });
  } catch (error) {
    return c.json({ error: 'Anki-Connect unreachable' }, 503);
  }
});

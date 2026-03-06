import { createProxyMiddleware } from 'http-proxy-middleware';
export const ankiProxy = createProxyMiddleware({
  target: 'http://localhost:8765',
  changeOrigin: true,
  pathRewrite: {
    '^/anki': '', // remove /anki prefix when forwarding
  },
});

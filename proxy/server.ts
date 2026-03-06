import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ankiProxy } from './routes/ankiProxy';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../dist');
const indexPath = path.resolve(distPath, 'index.html');

const app = express();

// Enable CORS
app.use(cors());

// Debugging: Log every request to see what's happening
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// 1. Anki Proxy
app.use('/anki', ankiProxy);

// 2. Serve Static Files (this handles / and assets automatically)
app.use(express.static(distPath));

// 3. SPA Fallback: If no file was found and it's a GET request for HTML
// We use a middleware function instead of app.get('*') to bypass Express 5's strict routing
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.url.startsWith('/anki')) {
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
  }
  next();
});

export default app;

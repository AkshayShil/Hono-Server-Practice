import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { ankiProxy } from './routes/ankiProxy';

// Required for ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());

// Anki Proxy - handles /anki requests
app.use('/anki', ankiProxy);

// Serve static files from the built Vue app
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

// Catch-all route to serve index.html for SPA (Vue Router support)
app.get('*', (req, res) => {
  // If request is not for /anki (which is already handled), serve the app
  if (!req.path.startsWith('/anki')) {
    res.sendFile(path.join(distPath, 'index.html'));
  }
});

export default app;

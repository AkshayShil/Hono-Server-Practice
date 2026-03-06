import express from 'express';
import cors from 'cors';
import { ankiProxy } from './routes/ankiProxy';
const app = express();
app.use(cors());
app.use('/anki', ankiProxy);
export default app;

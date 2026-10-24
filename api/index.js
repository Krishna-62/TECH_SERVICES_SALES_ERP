// Local API server. Reads .env from the repository root.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = (await import('./app.js')).default;

const PORT = Number(process.env.PORT) || 4100;
app.listen(PORT, () => console.log(`Technicon Sales ERP API listening on http://localhost:${PORT}`));

import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const outputDirectory = fileURLToPath(new URL('../dist/server/', import.meta.url));
const workerSource = fileURLToPath(new URL('../server/static-worker.mjs', import.meta.url));

await mkdir(outputDirectory, { recursive: true });
await copyFile(workerSource, `${outputDirectory}/index.js`);

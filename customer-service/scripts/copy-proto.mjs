import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const projectRoot = join(import.meta.dirname, '..');
const sourcePath = join(projectRoot, 'proto', 'customer.proto');
const outputPath = join(projectRoot, 'dist', 'proto', 'customer.proto');

await mkdir(dirname(outputPath), { recursive: true });
await copyFile(sourcePath, outputPath);

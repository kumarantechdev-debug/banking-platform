const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(__dirname, '..', 'proto', 'search.proto');
const destination = path.resolve(__dirname, '..', 'dist', 'proto');

fs.mkdirSync(destination, { recursive: true });
fs.copyFileSync(source, path.join(destination, 'search.proto'));

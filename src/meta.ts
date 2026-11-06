import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name: string; version: string };

/** Published npm name, e.g. `@baum97/create-mcp-server`. */
export const PACKAGE_NAME = pkg.name;
export const PACKAGE_VERSION = pkg.version;
/** How users invoke the CLI without installing it. */
export const NPX = `npx ${PACKAGE_NAME}`;

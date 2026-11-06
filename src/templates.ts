import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type TemplateLanguage = 'typescript' | 'python';
export type TemplateTransport = 'stdio' | 'http';

export interface TemplateInfo {
  name: string;
  description: string;
  language: TemplateLanguage;
  transport: TemplateTransport;
  path: string;
}

/** Template used by `--yes` when none is given. */
export const DEFAULT_TEMPLATE = 'typescript-stdio-tool';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATES_ROOT = path.resolve(__dirname, '../templates');

export async function listTemplates(): Promise<TemplateInfo[]> {
  if (!(await fs.pathExists(TEMPLATES_ROOT))) return [];

  const entries = await fs.readdir(TEMPLATES_ROOT, { withFileTypes: true });
  const templates: (TemplateInfo & { order: number })[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metaPath = path.join(TEMPLATES_ROOT, entry.name, 'template.json');
    const meta = (await fs.pathExists(metaPath)) ? await fs.readJson(metaPath) : {};
    templates.push({
      name: entry.name,
      description: meta.description ?? '',
      language: meta.language === 'python' ? 'python' : 'typescript',
      transport: meta.transport === 'http' ? 'http' : 'stdio',
      path: path.join(TEMPLATES_ROOT, entry.name),
      order: typeof meta.order === 'number' ? meta.order : Number.MAX_SAFE_INTEGER,
    });
  }

  templates.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  return templates.map(({ order: _order, ...t }) => t);
}

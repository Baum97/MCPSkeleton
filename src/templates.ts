import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface TemplateInfo {
  name: string;
  description: string;
  path: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATES_ROOT = path.resolve(__dirname, '../templates');

export async function listTemplates(): Promise<TemplateInfo[]> {
  if (!(await fs.pathExists(TEMPLATES_ROOT))) return [];

  const entries = await fs.readdir(TEMPLATES_ROOT, { withFileTypes: true });
  const templates: TemplateInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metaPath = path.join(TEMPLATES_ROOT, entry.name, 'template.json');
    let description = '';
    if (await fs.pathExists(metaPath)) {
      const meta = await fs.readJson(metaPath);
      description = meta.description ?? '';
    }
    templates.push({
      name: entry.name,
      description,
      path: path.join(TEMPLATES_ROOT, entry.name),
    });
  }

  return templates;
}

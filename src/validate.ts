// npm package naming rules: lowercase letters, digits, hyphens, dots,
// underscores, optional @scope/ prefix. No leading dot or underscore,
// no spaces, no uppercase, ≤214 chars.
const VALID_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const RESERVED = new Set(['node_modules', 'favicon.ico']);

export function validateProjectName(name: string): true | string {
  if (!name || !name.trim()) return 'Project name cannot be empty.';
  if (name.length > 214) return 'Project name must be 214 characters or fewer.';
  if (name.toLowerCase() !== name) return 'Project name must be lowercase.';
  if (/^[._]/.test(name)) return 'Project name cannot start with "." or "_".';
  if (RESERVED.has(name)) return `"${name}" is reserved by npm.`;
  if (!VALID_NAME.test(name)) {
    return 'Project name may only contain lowercase letters, digits, "-", ".", "_", and an optional "@scope/" prefix.';
  }
  return true;
}

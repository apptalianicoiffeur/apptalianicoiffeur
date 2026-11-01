/**
 * Node module hook: resolve Vite-style extensionless relative imports
 * (`from './constants'`) when the same sources run under plain Node
 * (tests, migration scripts). Bundlers resolve them automatically; Node's
 * ESM loader requires the exact file, so `.js` is appended on demand.
 *
 * Registered once via register.mjs (`node --import ./tests/hooks/register.mjs`).
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    const relative = specifier.startsWith('./') || specifier.startsWith('../');
    const alreadyHasExt = /\.[cm]?[jt]sx?$|\.json$/.test(specifier);
    const missing =
      err?.code === 'ERR_MODULE_NOT_FOUND' || err?.code === 'ERR_UNSUPPORTED_DIR_IMPORT';
    if (relative && !alreadyHasExt && missing) {
      return nextResolve(`${specifier}.js`, context);
    }
    throw err;
  }
}

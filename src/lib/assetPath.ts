import { apiBridge } from './apiBridge';

export async function getAssetPath(relativePath: string): Promise<string> {
  try {
    if (typeof window !== 'undefined') {
      // If running in a dev server (http/https), prefer the web-served path
      if (window.location && window.location.protocol && window.location.protocol.startsWith('http')) {
        return `/${relativePath.replace(/^\//, '')}`
      }

      const base = await apiBridge.getAssetBasePath();
      if (base) {
        // Normalize path: replace backslashes with forward slashes, remove trailing slashes
        const normalizedBase = base.replace(/\\/g, '/').replace(/\/+$/, '')
        // Ensure relativePath doesn't start with a slash
        const normalizedRelative = relativePath.replace(/^\//, '')
        // Construct file:// URL, ensuring no double slashes
        const fullPath = `${normalizedBase}/${normalizedRelative}`.replace(/\/+/g, '/')
        return `file://${fullPath}`
      }
    }
  } catch (err) {
    console.error('[getAssetPath] Error resolving path:', err)
    // ignore and use fallback
  }

  // Fallback for web/dev server: public/wallpapers are served at '/wallpapers/...'
  return `/${relativePath.replace(/^\//, '')}`
}

export default getAssetPath;

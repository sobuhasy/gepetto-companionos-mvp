import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';

const MODEL_EXTENSIONS = new Set(['.json', '.png', '.moc3']);
const SDK_EXTENSIONS = new Set(['.js', '.wasm', '.data', '.mem', '.json', '.vert', '.frag', '.glsl']);
const NOTICE_EXTENSIONS = new Set(['.txt', '.md', '.html', '.htm']);

function contained(root: string, target: string): boolean {
    const path = relative(root, target);
    return path !== '' && !isAbsolute(path) && path !== '..' && !path.startsWith(`..\\`) && !path.startsWith('../');
}

/** Checks lexical paths and real paths, including symlink/junction targets, before reading local assets. */
export async function readLocalAvatarAsset(root: string, requestPath: string, kind: 'model' | 'sdk'): Promise<{ data: Buffer; extension: string; plainText: boolean }> {
    let decoded: string;
    try { decoded = decodeURIComponent(requestPath); }
    catch { throw new Error('Invalid asset path.'); }
    if (!decoded || /[\\:%?#\u0000-\u001f]/.test(decoded)
        || decoded.split('/').some(part => !part || part === '.' || part === '..')) {
        throw new Error('Invalid asset path.');
    }
    const extension = extname(decoded).toLowerCase();
    const plainText = kind === 'sdk' && decoded.startsWith('licenses/') && NOTICE_EXTENSIONS.has(extension);
    if (!plainText && !(kind === 'model' ? MODEL_EXTENSIONS : SDK_EXTENSIONS).has(extension)) throw new Error('Unsupported avatar asset.');
    const resolvedRoot = await realpath(root);
    const candidate = resolve(resolvedRoot, decoded);
    if (!contained(resolvedRoot, candidate)) throw new Error('Asset is outside the configured directory.');
    const target = await realpath(candidate);
    if (!contained(resolvedRoot, target) || !(await stat(target)).isFile()) throw new Error('Invalid avatar asset.');
    return { data: await readFile(target), extension, plainText };
}

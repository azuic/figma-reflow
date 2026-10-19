import { build } from 'esbuild';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/code.ts'], bundle: true, outfile: 'dist/code.js', target: 'es2017', format: 'iife' });
const worker = await build({ entryPoints: ['src/worker.ts'], bundle: true, write: false, target: 'chrome100', format: 'iife', legalComments: 'inline' });
const ui = await build({ entryPoints: ['src/ui.ts'], define: { __WORKER_SOURCE__: JSON.stringify(worker.outputFiles[0].text) }, bundle: true, write: false, target: 'chrome100', format: 'iife', legalComments: 'inline' });
const fontData = (await readFile('assets/DepartureMono-Regular.woff2')).toString('base64');
const html = (await readFile('src/ui.html', 'utf8')).replace('/* FONT_DATA */', () => fontData).replace('/* BUNDLED_SCRIPT */', () => ui.outputFiles[0].text.replaceAll('</script', '<\\/script'));
await writeFile('dist/ui.html', html);
await copyFile('node_modules/@chenglou/pretext/LICENSE', 'dist/PRETEXT-LICENSE.txt');
await copyFile('node_modules/@chenglou/pretext/LICENSE', 'PRETEXT-LICENSE.txt');
console.log('Built dist/code.js and dist/ui.html (Pretext bundled; no network access).');

await copyFile('assets/DEPARTURE-MONO-LICENSE.txt', 'dist/DEPARTURE-MONO-LICENSE.txt');

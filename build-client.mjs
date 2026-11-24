import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const result = await build({
  entryPoints: [fileURLToPath(new URL('./src/client/index.js', import.meta.url))],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  external: ['react'],
  loader: { '.css': 'text' },
  treeShaking: true,
  legalComments: 'none',
  metafile: true,
});
const code = result.outputFiles[0].text;
if (/require\(["']@deepseek-ai\//.test(code)) throw new Error('Client must not import private DSH packages');
const output = `// Generated from src/client/index.js by node build-client.mjs.\nwindow.__ModuleLoader__.load({\n  id: "@wujiaming88/dsh-remote-ssh",\n  factory: function(require) {\n    var module = {exports: {}};\n    var exports = module.exports;\n${code}\n    return module.exports;\n  }\n});\n`;
await writeFile(new URL('./lib/client.js', import.meta.url), output);
console.log(`Built ${Object.keys(result.metafile.inputs).length} client modules into one factory (${Buffer.byteLength(output)} bytes)`);

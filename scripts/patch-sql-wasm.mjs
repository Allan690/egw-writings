import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const src = join(__dirname, '../src/vendor/sql-wasm.js')
const out = join(__dirname, '../src/vendor/sql-wasm.mjs')

let code = readFileSync(src, 'utf8')

// Drop CommonJS/AMD export footer (references `module` / `exports`).
code = code.replace(/\/\/ This bit below is copied almost exactly[\s\S]*$/m, '')

// Emscripten assigns to `module` during init — declare CJS shims for browser ESM.
const patched = `var module = { exports: {} };
var exports = module.exports;
${code.trim()}
export default initSqlJs;
`

writeFileSync(out, patched)
console.log('Patched sql-wasm.mjs')

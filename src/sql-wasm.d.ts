declare module 'fts5-sql-bundle/dist/sql-wasm.js' {
  import type { InitSqlJsOptions, SqlJsStatic } from 'fts5-sql-bundle'
  function initSqlJs(options?: InitSqlJsOptions): Promise<SqlJsStatic>
  export default initSqlJs
}

declare module '../vendor/sql-wasm.js' {
  import type { InitSqlJsOptions, SqlJsStatic } from 'fts5-sql-bundle'
  function initSqlJs(options?: InitSqlJsOptions): Promise<SqlJsStatic>
  export default initSqlJs
}

declare module '@/vendor/sql-wasm.js' {
  import type { InitSqlJsOptions, SqlJsStatic } from 'fts5-sql-bundle'
  function initSqlJs(options?: InitSqlJsOptions): Promise<SqlJsStatic>
  export default initSqlJs
}

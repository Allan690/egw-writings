import type { InitSqlJsOptions, SqlJsStatic } from 'fts5-sql-bundle'

declare function initSqlJs(options?: InitSqlJsOptions): Promise<SqlJsStatic>
export default initSqlJs

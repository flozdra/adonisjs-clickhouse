import { FileNode } from './index.js'

/**
 * Migrations config
 */
export type MigrationsConfig = {
  /**
   * Path to the migrations directory
   * @default ['clickhouse/migrations']
   */
  paths?: string[]
  /**
   * Name of the table to store the migrations
   * @default 'adonis_schema'
   */
  tableName?: string
  /**
   * Prevent rollbacks in production
   * @default false
   */
  disableRollbacksInProduction?: boolean
  /**
   * Use natural sort for migration files
   */
  naturalSort?: boolean
}

/**
 * Options accepted by migrator constructor
 */
export type MigratorOptions =
  | {
      direction: 'up'
      connectionName?: string
      dryRun?: boolean
    }
  | {
      direction: 'down'
      batch?: number
      step?: number
      connectionName?: string
      dryRun?: boolean
    }

/**
 * Shape of migrated file within migrator
 */
export type MigratedFileNode = {
  status: 'completed' | 'error' | 'pending'
  file: FileNode<unknown>
  queries: string
  batch: number
}

/**
 * Shape of migrated file within migrator
 */
export type MigrationListNode = {
  name: string
  status: 'pending' | 'migrated' | 'corrupt'
  batch?: number
  migrationTime?: string
}

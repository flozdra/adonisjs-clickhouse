import { NodeClickHouseClientConfigOptions } from '@clickhouse/client/dist/config.js'
import { MigrationsConfig } from './migration.js'
import { SeedersConfig } from './seeder.js'

export type FileNode<T> = {
  absPath: string
  name: string
  getSource: () => T | Promise<T>
}

export type ConnectionConfig = NodeClickHouseClientConfigOptions & {
  /**
   * Debug mode for the connection
   */
  debug?: boolean

  /**
   * Migrations configuration
   */
  migrations?: MigrationsConfig

  /**
   * Seeders configuration
   */
  seeders?: SeedersConfig
}

export type ConnectionsList = Record<string, ConnectionConfig>

export interface ClickHouseConfig {
  connection: keyof ConnectionsList
  prettyPrintDebugQueries?: boolean
  connections: ConnectionsList
}

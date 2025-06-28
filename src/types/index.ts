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
   * The cluster name to use in the package commands and migration tables.
   *
   * If defined, the commands CREATE, ALTER, DROP, RENAME, TRUNCATE executed by the
   * package will include the `ON CLUSTER` clause.
   *
   * This concerns `clickhouse:db:truncate`, `clickhouse:db:wipe`, and the creation of
   * migration tables.
   *
   * You may also want to configure the `migrations.replicatedMergeTree` to replicate
   * the migration tables across the cluster.
   *
   * **Warning: This option doesn't affected the calls made with `client.command()` and
   * `client.query()` methods. You have to specify the `ON CLUSTER` clause manually in
   * your queries.**
   * @optional
   */
  clusterName?: string

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

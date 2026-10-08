import type { NodeClickHouseClientConfigOptions } from '@clickhouse/client/dist/config.js'
import type { MigrationsConfig } from './migration.js'
import type { SeedersConfig } from './seeder.js'

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

export interface ClickHouseConfig<Connections extends ConnectionsList = ConnectionsList> {
  /**
   * Default connection
   */
  connection: keyof Connections & string
  prettyPrintDebugQueries?: boolean
  connections: Connections
}

/**
 * Infer the connections from the user config
 */
export type InferConnections<T extends { connections: ConnectionsList }> = T['connections']

/**
 * A list of known connections. Using declaration merging, the application
 * can augment this interface to get type-safe connection names.
 *
 * ```ts
 * declare module 'adonisjs-clickhouse/types' {
 *   interface ClickHouseConnections extends InferConnections<typeof clickhouseConfig> {}
 * }
 * ```
 */
export interface ClickHouseConnections {}

/**
 * Names of the given connections. Falls back to `string` when
 * no connections are known.
 */
export type ConnectionNameOf<Connections> = keyof Connections extends never
  ? string
  : keyof Connections & string

/**
 * Name of a connection, based on the `ClickHouseConnections` interface
 */
export type ConnectionName = ConnectionNameOf<ClickHouseConnections>

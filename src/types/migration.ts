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

  /**
   * ReplicatedMergeTree options for the migration tables to replicate the tables across a ClickHouse cluster.
   *
   * You may also want to set the `clusterName` option in the connection config to use the `ON CLUSTER` clause.
   *
   * When creating `ReplicatedMergeTree` tables, you can either specify the `zooKeeperPath` and the `replicaName` as
   * parameters to the `ReplicatedMergeTree` engine, or use the engine without parameters. In this case, the server will
   * use the default values from the ClickHouse server configuration (`<default_replica_path>` and `<default_replica_name>`).
   *
   * You can set this option to:
   * - an object: it will create the tables as follows: `ReplicatedMergeTree(<zooKeeperPath>, <replicaName>)`.
   * - `true`: it will create the tables with `ReplicatedMergeTree`, without any parameters.
   *
   * In ClickHouse Cloud, you don't need to specify any parameters in the `ReplicationMergeTree` as replication is managed by the service.
   * In this case, you can set this option to `true`.
   *
   * See [ClickHouse documentation](https://clickhouse.com/docs/engines/table-engines/mergetree-family/replication) for more details.
   * @optional
   */
  replicatedMergeTree?: { zooKeeperPath: string; replicaName: string } | true
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

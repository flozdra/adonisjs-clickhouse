import dotenv from 'dotenv'
import { Logger } from '@adonisjs/core/logger'
import { Emitter } from '@adonisjs/core/events'
import { AppFactory } from '@adonisjs/core/factories/app'
import { ClickHouseConfig, ConnectionConfig } from '../src/types/index.js'
import { getActiveTest } from '@japa/runner'
import { createClient } from '@clickhouse/client'
import { ClickHouse } from '../src/clickhouse/main.js'
import { FileSystem } from '@japa/file-system'

dotenv.config()
export const APP_ROOT = new URL('./tmp', import.meta.url)

const app = new AppFactory().create(APP_ROOT, () => {})
export const emitter = new Emitter<any>(app)
export const logger = new Logger({})
export const createEmitter = () => new Emitter<any>(app)

export function getConnectionConfig(): ConnectionConfig {
  return {
    application: 'AdonisJS',
    url: process.env.CLICKHOUSE_URL,
    database: process.env.CLICKHOUSE_DB,
    username: process.env.CLICKHOUSE_USER,
    password: process.env.CLICKHOUSE_PASSWORD,
  }
}

export function getClusterConnectionConfig(node: 'node01' | 'node02' = 'node01'): ConnectionConfig {
  return {
    application: 'AdonisJS',
    url:
      node === 'node01'
        ? process.env.CLICKHOUSE_CLUSTER_01_URL
        : process.env.CLICKHOUSE_CLUSTER_02_URL,
    database: process.env.CLICKHOUSE_DB,
    username: process.env.CLICKHOUSE_USER,
    password: process.env.CLICKHOUSE_PASSWORD,
    clusterName: process.env.CLICKHOUSE_CLUSTER_NAME,
    migrations: {
      replicatedMergeTree: {
        zooKeeperPath: process.env.CLICKHOUSE_CLUSTER_ZOOKEEPER_PATH!,
        replicaName: process.env.CLICKHOUSE_CLUSTER_REPLICA_NAME!,
      },
    },
  }
}

/**
 * Create a new migration file using a counter to ensure unique filenames
 * @returns the filename
 */
let counter = 0
export async function createMigrationFile(fs: FileSystem, tableName: string, customName?: string) {
  // Ensure each file is created by incrementing the counter + unique timestamp
  const migrationName =
    customName ?? `clickhouse/migrations/${++counter}_create_${tableName}_${new Date().getTime()}`
  await fs.create(
    `${migrationName}.ts`,
    `
      import { BaseSchema } from '../../../../src/schema/main.js'
      export default class extends BaseSchema {
        async up() {
          await this.client.command({
            query: "CREATE TABLE ${tableName} (name LowCardinality(String), time DateTime) ENGINE = MergeTree ORDER BY (name, time);"
          })
        }
        async down() {
          await this.client.command({ query: "DROP TABLE ${tableName};" })
        }
      }
    `
  )
  return migrationName
}

/**
 * Same as `createMigrationFile`, but for cluster migrations
 * It will create a table with the ReplicatedMergeTree engine and the `ON CLUSTER` clause
 * and SYNC to ensure the operation is synchronous.
 * @returns the filename
 */
export async function createClusterMigrationFile(
  fs: FileSystem,
  tableName: string,
  customName?: string
) {
  // Ensure each file is created by incrementing the counter + unique timestamp
  const migrationName =
    customName ?? `clickhouse/migrations/${++counter}_create_${tableName}_${new Date().getTime()}`
  await fs.create(
    `${migrationName}.ts`,
    `
      import { BaseSchema } from '../../../../src/schema/main.js'
      export default class extends BaseSchema {
        async up() {
          await this.client.command({
            query: "CREATE TABLE ${tableName} ON CLUSTER ${process.env.CLICKHOUSE_CLUSTER_NAME} (name LowCardinality(String), time DateTime) ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/{database}/{table}', '{replica}') ORDER BY (name, time);"
          })
        }
        async down() {
          await this.client.command({ query: "DROP TABLE ${tableName} ON CLUSTER ${process.env.CLICKHOUSE_CLUSTER_NAME} SYNC;" })
        }
      }
    `
  )
  return migrationName
}

/**
 * Create a new seeder file using a counter to ensure unique filenames
 * @returns the filename
 */
export async function createSeederFile(fs: FileSystem, content: string, customName?: string) {
  // Ensure each file is created by incrementing the counter + unique timestamp
  const seederName = customName ?? `clickhouse/seeders/${++counter}_seeder_${new Date().getTime()}`
  await fs.create(`${seederName}.ts`, content)
  return seederName
}

/**
 * Does base setup by creating wikistat table
 * If the config provided has a clusterName, it will create a table
 * with the ReplicatedMergeTree engine and the `ON CLUSTER` clause.
 */
export async function setup() {
  const client = createClient(getConnectionConfig())

  await client.command({
    query: `
        CREATE TABLE wikistat
        (
            time DateTime CODEC(Delta(4), ZSTD(1)),
            project LowCardinality(String),
            subproject LowCardinality(String),
            path String,
            hits UInt64
        )
        ENGINE = MergeTree
        ORDER BY (path, time);`,
  })
}

/**
 * Same as `setup`, but for cluster setup
 * It will create the wikistat table with the ReplicatedMergeTree engine
 * and the `ON CLUSTER` clause.
 */
export async function setupCluster() {
  const config = getClusterConnectionConfig()
  const client = createClient(config)
  const { zooKeeperPath, replicaName } = config.migrations!.replicatedMergeTree! as {
    zooKeeperPath: string
    replicaName: string
  }

  await client.command({
    query: `
        CREATE TABLE wikistat ON CLUSTER ${config.clusterName}
        (
            time DateTime CODEC(Delta(4), ZSTD(1)),
            project LowCardinality(String),
            subproject LowCardinality(String),
            path String,
            hits UInt64
        )
        ENGINE = ReplicatedMergeTree('${zooKeeperPath}', '${replicaName}')
        ORDER BY (path, time);`,
  })
}

/**
 * Does cleanup by dropping wikistat table or custom tables if provided
 */
export async function cleanup(customTables?: string[]) {
  counter = 0 // Reset counter for migration and seeder files

  const client = createClient(getConnectionConfig())

  if (customTables?.length) {
    for (const table of customTables) {
      await client.command({ query: `DROP TABLE IF EXISTS ${table}` })
    }
    return
  }
  await client.command({ query: `DROP TABLE IF EXISTS wikistat` })
}

/**
 * Same as `cleanup`, but for cluster setup
 * It will drop the wikistat table or custom tables if provided,
 * using the `ON CLUSTER` clause + SYNC to ensure the operation is synchronous.
 */
export async function cleanupCluster(customTables?: string[]) {
  counter = 0 // Reset counter for migration and seeder files

  const config = getClusterConnectionConfig()
  const client = createClient(config)

  if (customTables?.length) {
    for (const table of customTables) {
      await client.command({
        query: `DROP TABLE IF EXISTS ${table} ON CLUSTER ${config.clusterName} SYNC`,
      })
    }
    return
  }
  await client.command({
    query: `DROP TABLE IF EXISTS wikistat ON CLUSTER ${config.clusterName} SYNC`,
  })
}

/**
 * Returns the ClickHouse instance
 */
export function getClickHouse(config?: ClickHouseConfig) {
  const defaultConfig: ClickHouseConfig = {
    connection: 'primary',
    connections: {
      primary: getConnectionConfig(),
    },
  }

  const clickhouse = new ClickHouse(config || defaultConfig, logger, createEmitter())
  const test = getActiveTest()
  test?.cleanup(() => {
    return clickhouse.manager.closeAll()
  })

  return clickhouse
}

/**
 * Returns the ClickHouse instance for the cluster setup
 * with two nodes: node01 and node02.
 */
export function getClickHouseCluster() {
  return getClickHouse({
    connection: 'node01',
    connections: {
      node01: getClusterConnectionConfig('node01'),
      node02: getClusterConnectionConfig('node02'),
    },
  })
}

/**
 * Get migrated files from the adonis_schema table
 */
export async function getMigrated(clickhouse: ClickHouse, connection?: string) {
  return clickhouse
    .connection(connection)
    .query({ query: 'SELECT * FROM adonis_schema ORDER BY id;' })
    .toJSONEachRow<{ name: string; batch: string }>()
}

/**
 * Check if table exists in the database
 */
export async function tableExists(clickhouse: ClickHouse, tableName: string, connection?: string) {
  const exists = await clickhouse
    .connection(connection)
    .query({ query: `EXISTS TABLE ${tableName}` })
    .toJSONEachRow<{ result: 0 | 1 }>()
  return exists[0].result === 1
}

/**
 * Converts a map to an object
 */
export function mapToObj<T extends any>(collection: Map<any, any>): T {
  let obj = {} as T
  collection.forEach((value, key) => {
    ;(obj as any)[key] = value
  })
  return obj
}

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
    url: process.env.CLICKHOUSE_HOST,
    database: process.env.CLICKHOUSE_DB,
    username: process.env.CLICKHOUSE_USER,
    password: process.env.CLICKHOUSE_PASSWORD,
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
 * Does base setup by creating wikistats tables
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

  await client.command({
    query: `
        CREATE TABLE wikistat_top_projects
        (
            date Date,
            project LowCardinality(String),
            hits UInt32
        )
        ENGINE = SummingMergeTree
        ORDER BY (date, project);`,
  })

  await client.command({
    query: `
        CREATE MATERIALIZED VIEW wikistat_top_projects_mv TO wikistat_top_projects AS
        SELECT
            date(time) AS date,
            project,
            sum(hits) AS hits
        FROM wikistat
        GROUP BY
            date,
            project;`,
  })
}

/**
 * Does cleanup by dropping wikistats tables or custom tables
 */
export async function cleanup(customTables?: string[]) {
  counter = 0 // Reset counter for migration and seeder files

  const client = createClient(getConnectionConfig())
  if (customTables?.length) {
    for (const table of customTables) {
      await client.command({ query: `DROP TABLE IF EXISTS ${table};` })
    }
    return
  }
  await client.command({ query: `DROP TABLE IF EXISTS wikistat;` })
  await client.command({
    query: `DROP TABLE IF EXISTS wikistat_top_projects;`,
  })
  await client.command({
    query: `DROP TABLE IF EXISTS wikistat_top_projects_mv;`,
  })
}

/**
 * Returns the ClickHouse instance
 */
export function getClickHouse(eventEmitter?: Emitter<any>, config?: ClickHouseConfig) {
  const defaultConfig: ClickHouseConfig = {
    connection: 'primary',
    connections: {
      primary: getConnectionConfig(),
    },
  }

  const clickhouse = new ClickHouse(
    config || defaultConfig,
    logger,
    eventEmitter || createEmitter()
  )
  const test = getActiveTest()
  test?.cleanup(() => {
    return clickhouse.manager.closeAll()
  })

  return clickhouse
}

/**
 * Get migrated files from the adonis_schema table
 */
export async function getMigrated(clickhouse: ClickHouse) {
  return clickhouse
    .query({ query: 'SELECT * FROM adonis_schema ORDER BY id;' })
    .toJSONEachRow<{ name: string; batch: string }>()
}

/**
 * Check if table exists in the database
 */
export async function tableExists(clickhouse: ClickHouse, tableName: string) {
  const exists = await clickhouse
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

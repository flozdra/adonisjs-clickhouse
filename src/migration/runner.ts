import { EventEmitter } from 'node:events'
import {
  MigratorOptions,
  MigratedFileNode,
  MigrationListNode,
  MigrationsConfig,
} from '../types/migration.js'
import { MigrationSource } from './source.js'
import { Application } from '@adonisjs/core/app'
import * as errors from '../errors.js'
import { MethodClientContract } from '../types/method.js'
import { ConnectionConfig, FileNode } from '../types/index.js'
import { ClickHouse } from '../clickhouse/main.js'
import { BaseSchema } from '../schema/main.js'

/**
 * Migrator exposes the API to execute migrations using the schema files
 * for a given connection at a time.
 */
export class MigrationRunner extends EventEmitter {
  private client: MethodClientContract
  private config: ConnectionConfig

  /**
   * Reference to the migrations config for the given connection
   */
  private migrationsConfig: MigrationsConfig

  /**
   * Table names for storing schema files and schema versions
   */
  private schemaTableName: string
  private schemaVersionsTableName: string

  /**
   * Whether the migrator has been booted
   */
  private booted: boolean = false

  /**
   * Migration source to collect schema files from the disk
   */
  private migrationSource: MigrationSource

  /**
   * Flag to know if running the app in production
   */
  isInProduction: boolean

  /**
   * Mode decides in which mode the migrator is executing migrations. The migrator
   * instance can only run in one mode at a time.
   *
   * The value is set when `migrate` or `rollback` method is invoked
   */
  direction: 'up' | 'down'

  /**
   * Instead of executing migrations, just return the generated SQL queries
   */
  dryRun: boolean

  /**
   * An array of files we have successfully migrated. The files are
   * collected regardless of `up` or `down` methods
   */
  migratedFiles: { [file: string]: MigratedFileNode } = {}

  /**
   * Last error occurred when executing migrations
   */
  error: null | Error = null

  /**
   * Current status of the migrator
   */
  get status() {
    return !this.booted
      ? 'pending'
      : this.error
        ? 'error'
        : Object.keys(this.migratedFiles).length
          ? 'completed'
          : 'skipped'
  }

  /**
   * Existing version of migrations. We use versioning to upgrade
   * existing migrations if we are plan to make a breaking
   * change.
   */
  version: number = 1

  constructor(
    private clickhouse: ClickHouse,
    private app: Application<any>,
    private options: MigratorOptions
  ) {
    super()
    this.client = this.clickhouse.connection(
      this.options.connectionName || this.clickhouse.primaryConnectionName
    )
    this.config = this.clickhouse.getRawConnection(this.client.connection.name)!.config
    this.migrationsConfig = Object.assign({ tableName: 'adonis_schema' }, this.config.migrations)
    this.schemaTableName = this.migrationsConfig.tableName!
    this.schemaVersionsTableName = `${this.schemaTableName}_versions`
    this.migrationSource = new MigrationSource(this.config, this.app)
    this.direction = this.options.direction
    this.dryRun = !!this.options.dryRun
    this.isInProduction = app.inProduction
  }

  /**
   * Writes the migrated file to the migrations table. This ensures that
   * we are not re-running the same migration again
   */
  private async recordMigrated(name: string) {
    if (this.dryRun) {
      return
    }

    const latestId = await this.getLatestID()
    await this.client.insert({
      table: this.schemaTableName,
      values: [{ id: latestId + 1, name, batch: this.migratedFiles[name].batch }],
      columns: ['id', 'name', 'batch'],
      format: 'JSONEachRow',
    })
  }

  /**
   * Removes the migrated file from the migrations table. This allows re-running
   * the migration
   */
  private async recordRollback(name: string) {
    if (this.dryRun) {
      return
    }
    await this.client.command({
      query: `ALTER TABLE ${this.schemaTableName} DELETE WHERE name = {name:String} SETTINGS mutations_sync = 2;`,
      query_params: { name },
    })
  }

  /**
   * Returns the migration source by ensuring value is a class constructor.
   */
  private async getMigrationSource(migration: FileNode<unknown>): Promise<typeof BaseSchema> {
    const source = await migration.getSource()
    if (typeof source === 'function') {
      return source as typeof BaseSchema
    }

    throw new Error(`Invalid schema class exported by "${migration.name}"`)
  }

  /**
   * Executes a given migration node
   */
  private async executeMigration(migration: FileNode<unknown>) {
    const SchemaClass = await this.getMigrationSource(migration)

    try {
      const schema = new SchemaClass(this.client, migration.name, this.dryRun)
      this.emit('migration:start', this.migratedFiles[migration.name])

      if (this.direction === 'up') {
        await schema.execUp() // Handles dry run itself
        await this.recordMigrated(migration.name) // Handles dry run itself
      } else if (this.direction === 'down') {
        await schema.execDown() // Handles dry run itself
        await this.recordRollback(migration.name) // Handles dry run itself
      }

      this.migratedFiles[migration.name].status = 'completed'
      this.emit('migration:completed', this.migratedFiles[migration.name])
    } catch (error) {
      this.error = error
      this.migratedFiles[migration.name].status = 'error'
      this.emit('migration:error', this.migratedFiles[migration.name])
      throw error
    }
  }

  /**
   * Makes the migrations table (if missing). Also created in dry run, since
   * we always reads from the schema table to find which migrations files to
   * execute and that cannot be done without missing table.
   */
  private async makeMigrationsTable() {
    const hasTable = await this.client
      .query({ query: `EXISTS TABLE ${this.schemaTableName}` })
      .toJSONEachRow<{ result: 0 | 1 }>()
    if (hasTable[0].result) {
      return
    }

    this.emit('create:schema:table')
    await this.client.command({
      query: `
        CREATE TABLE ${this.schemaTableName}
        (id UInt32, name String, batch UInt32, migration_time DateTime DEFAULT now())
        ENGINE = MergeTree()
        ORDER BY (migration_time);
      `,
    })
  }

  /**
   * Makes the migrations version table (if missing).
   */
  private async makeMigrationsVersionsTable() {
    const hasTable = await this.client
      .query({ query: `EXISTS TABLE ${this.schemaVersionsTableName}` })
      .toJSONEachRow<{ result: 0 | 1 }>()
    if (hasTable[0].result) {
      return
    }

    /**
     * Create table
     */
    this.emit('create:schema_versions:table')
    await this.client.command({
      query: `
        CREATE TABLE ${this.schemaVersionsTableName}
        (version UInt32)
        ENGINE = MergeTree()
        ORDER BY (version);
      `,
    })
  }

  /**
   * Returns the latest migrations version. If no rows exist
   * it inserts a new row for version 1
   */
  private async getLatestVersion() {
    const rows = await this.client
      .query({ query: `SELECT version FROM ${this.schemaVersionsTableName} LIMIT 1;` })
      .toJSONEachRow<{ version: number }>()

    if (rows.length) {
      return Number(rows[0].version)
    } else {
      await this.client.insert({
        table: this.schemaVersionsTableName,
        values: [{ version: 1 }],
        format: 'JSONEachRow',
      })
      return 1
    }
  }

  /**
   * Upgrade migrations version - For now it is a noop, but
   * in future we can use it to upgrade existing migrations
   */
  private async upgradeVersion(_latestVersion: number): Promise<void> {}

  /**
   * Returns the latest batch from the migrations
   * table
   */
  private async getLatestBatch() {
    const rows = await this.client
      .query({
        query: `SELECT max(batch) as batch FROM ${this.schemaTableName};`,
      })
      .toJSONEachRow<{ batch: string }>()
    return Number(rows[0].batch)
  }

  /**
   * Returns the latest ID from the migrations
   * table
   */
  private async getLatestID() {
    const rows = await this.client
      .query({ query: `SELECT max(id) as id FROM ${this.schemaTableName};` })
      .toJSONEachRow<{ id: string }>()
    return Number(rows[0].id)
  }

  /**
   * Returns an array of files migrated till now
   */
  private async getMigratedFiles() {
    const rows = await this.client
      .query({ query: `SELECT name FROM ${this.schemaTableName} ORDER BY id;` })
      .toJSONEachRow<{ name: string }>()

    return new Set(rows.map(({ name }) => name))
  }

  /**
   * Returns an array of files migrated till now. The latest
   * migrations are on top
   */
  private async getMigratedFilesTillBatch(batch: number) {
    return this.client
      .query({
        query: `SELECT name, batch, migration_time, id FROM ${this.schemaTableName} WHERE batch > {batch:Int32} ORDER BY id DESC;`,
        query_params: { batch },
      })
      .toJSONEachRow<{
        name: string
        batch: number
        migration_time: string
        id: number
      }>()
  }

  /**
   * Boot the migrator to perform actions. All boot methods must
   * work regardless of dryRun is enabled or not.
   */
  private async boot() {
    this.emit('start')
    this.booted = true
    await this.makeMigrationsTable()
  }

  /**
   * Shutdown gracefully
   */
  private async shutdown() {
    this.emit('end')
  }

  /**
   * Migrate up
   */
  private async runUp() {
    const batch = await this.getLatestBatch()
    const existing = await this.getMigratedFiles()
    const collected = await this.migrationSource.getMigrations()

    /**
     * Upfront collecting the files to be executed
     */
    collected.forEach((migration) => {
      if (!existing.has(migration.name)) {
        this.migratedFiles[migration.name] = {
          status: 'pending',
          file: migration,
          batch: batch + 1,
        }
      }
    })

    const filesToMigrate = Object.keys(this.migratedFiles)
    for (let name of filesToMigrate) {
      await this.executeMigration(this.migratedFiles[name].file)
    }
  }

  /**
   * Migrate down (aka rollback)
   */
  private async runDown(batch?: number, step?: number) {
    if (this.isInProduction && this.migrationsConfig.disableRollbacksInProduction) {
      throw new Error(
        'Rollback in production environment is disabled. Check "config/clickhouse" file for options.'
      )
    }

    if (batch === undefined) {
      batch = (await this.getLatestBatch()) - 1
    }

    const existing = await this.getMigratedFilesTillBatch(batch)
    const collected = await this.migrationSource.getMigrations()

    if (step === undefined || step <= 0) {
      step = collected.length
    } else {
      batch = (await this.getLatestBatch()) - 1
    }

    /**
     * Finding schema files for migrations to rollback. We do not perform
     * rollback when any of the files are missing
     */
    existing.forEach((file) => {
      const migration = collected.find(({ name }) => name === file.name)
      if (!migration) {
        throw new errors.E_MISSING_SCHEMA_FILES([file.name])
      }

      this.migratedFiles[migration.name] = {
        status: 'pending',
        file: migration,
        batch: file.batch,
      }
    })

    this.migratedFiles = Object.fromEntries(Object.entries(this.migratedFiles).slice(0, step))
    const filesToMigrate = Object.keys(this.migratedFiles)
    for (let name of filesToMigrate) {
      await this.executeMigration(this.migratedFiles[name].file)
    }
  }

  on(event: 'start', callback: () => void): this
  on(event: 'end', callback: () => void): this
  on(event: 'create:schema:table', callback: () => void): this
  on(event: 'create:schema_versions:table', callback: () => void): this
  on(event: 'migration:start', callback: (file: MigratedFileNode) => void): this
  on(event: 'migration:completed', callback: (file: MigratedFileNode) => void): this
  on(event: 'migration:error', callback: (file: MigratedFileNode) => void): this
  on(event: string, callback: (...args: any[]) => void): this {
    return super.on(event, callback)
  }

  /**
   * Returns a merged list of completed and pending migrations
   */
  async getList(): Promise<MigrationListNode[]> {
    const existingCollected: Set<string> = new Set()
    await this.makeMigrationsTable()
    const existing = await this.getMigratedFilesTillBatch(0)
    const collected = await this.migrationSource.getMigrations()

    const list: MigrationListNode[] = collected.map((migration) => {
      const migrated = existing.find(({ name }) => migration.name === name)

      /**
       * Already migrated. We move to an additional list, so that we can later
       * find the one's which are migrated but now missing on the disk
       */
      if (migrated) {
        existingCollected.add(migrated.name)
        return {
          name: migration.name,
          batch: migrated.batch,
          status: 'migrated',
          migrationTime: migrated.migration_time,
        }
      }

      return {
        name: migration.name,
        status: 'pending',
      }
    })

    /**
     * These are the one's which were migrated earlier, but now missing
     * on the disk
     */
    existing.forEach(({ name, batch, migration_time }) => {
      if (!existingCollected.has(name)) {
        list.push({
          name,
          batch,
          migrationTime: migration_time,
          status: 'corrupt',
        })
      }
    })

    return list
  }

  /**
   * Migrate the database by calling the up method
   */
  async run() {
    try {
      await this.boot()

      /**
       * Upgrading migrations (if required)
       */
      await this.makeMigrationsVersionsTable()
      const latestVersion = await this.getLatestVersion()
      if (latestVersion < this.version) {
        await this.upgradeVersion(latestVersion)
      }

      if (this.direction === 'up') {
        await this.runUp()
      } else if (this.options.direction === 'down') {
        await this.runDown(this.options.batch, this.options.step)
      }
    } catch (error) {
      this.error = error
    }

    await this.shutdown()
  }

  /**
   * Close all connections
   */
  async close() {
    await this.clickhouse.manager.closeAll(true)
  }
}

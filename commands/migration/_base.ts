import prettyHrTime from 'pretty-hrtime'
import { BaseCommand } from '@adonisjs/core/ace'
import type { MigrationRunner } from '../../src/migration/runner.js'
import { MigratedFileNode } from '../../src/types/migration.js'

/**
 * Base class to execute migrations and print logs
 */
export default abstract class MigrationsBase extends BaseCommand {
  /**
   * Should print one-liner compact output
   */
  protected compactOutput = false

  /**
   * Not a valid connection
   */
  protected printNotAValidConnection(connection: string) {
    this.logger.error(
      `"${connection}" is not a valid connection name. Double check "config/clickhouse" file`
    )
  }

  /**
   * Prompts to take consent for running migrations in production
   */
  protected async takeProductionConsent(): Promise<boolean> {
    const question = 'You are in production environment. Want to continue running migrations?'
    try {
      return await this.prompt.confirm(question)
    } catch (error) {
      return false
    }
  }

  /**
   * Returns beautified log message string
   */
  protected printLogMessage(file: MigratedFileNode, direction: 'down' | 'up') {
    const color = file.status === 'pending' ? 'gray' : file.status === 'completed' ? 'green' : 'red'
    const arrow = this.colors[color]('❯')
    const message =
      file.status === 'pending'
        ? direction === 'up'
          ? 'migrating'
          : 'reverting'
        : file.status === 'completed'
          ? direction === 'up'
            ? 'migrated'
            : 'reverted'
          : 'error'

    this.logger.logUpdate(`${arrow} ${this.colors[color](message)} ${file.file.name}`)
  }

  /**
   * Pretty print sql queries of a file
   */
  private prettyPrintSql(file: MigratedFileNode, connectionName: string) {
    this.logger.log(this.colors.gray(`------------- ${file.file.name} -------------`))
    this.logger.log(file.queries)
    this.logger.log(`Connection: ${this.colors.cyan(connectionName)}`)
    this.logger.log(this.colors.gray('------------- END -------------'))
  }

  /**
   * Log final status with verbose output
   */
  private logVerboseFinalStatus(migrator: MigrationRunner, duration?: [number, number]) {
    switch (migrator.status) {
      case 'completed':
        const completionMessage = migrator.direction === 'up' ? 'Migrated in' : 'Reverted in'
        this.logger.log(`\n${completionMessage} ${this.colors.cyan(prettyHrTime(duration!))}`)
        break
      case 'skipped':
        const message =
          migrator.direction === 'up' ? 'Already up to date' : 'Already at latest batch'
        this.logger.log(this.colors.cyan(message))
        break
      case 'error':
        this.logger.fatal(migrator.error!)
        this.exitCode = 1
        break
    }
  }

  /**
   * Log final status with compact output
   */
  private logCompactFinalStatus(
    processedFiles: Set<string>,
    migrator: MigrationRunner,
    duration?: [number, number]
  ) {
    let output = ''
    let message = ''
    let isUp = migrator.direction === 'up'

    switch (migrator.status) {
      case 'completed':
        message = `❯ ${isUp ? 'Executed' : 'Reverted'} ${processedFiles.size} migrations`
        output = this.colors.grey(message + ` (${prettyHrTime(duration!)})`)

        break

      case 'skipped':
        message = `❯ ${isUp ? 'Already up to date' : 'Already at latest batch'}`
        output = this.colors.grey(message)
        break

      case 'error':
        const skippedMigrations = Object.values(migrator.migratedFiles).filter(
          (file) => file.status === 'pending'
        ).length

        message = `❯ Executed ${processedFiles.size} migrations, 1 error, ${skippedMigrations} skipped`
        this.logger.log(this.colors.red(message))
        this.logger.log('\n' + this.colors.red(migrator.error!.message))
        this.exitCode = 1
        break
    }

    this.logger.log(output)
  }

  /**
   * Runs the migrations using the migrator
   */
  protected async runMigrations(migrator: MigrationRunner, connectionName: string): Promise<void> {
    /**
     * Pretty print SQL in dry run and return early
     */
    if (migrator.dryRun) {
      await migrator.run()

      Object.keys(migrator.migratedFiles).forEach((file) => {
        this.prettyPrintSql(migrator.migratedFiles[file], connectionName)
      })

      return
    }

    /**
     * A set of files processed and emitted using event emitter.
     */
    const processedFiles: Set<string> = new Set()
    let start: [number, number] | undefined
    let duration: [number, number] | undefined

    /**
     * Starting to process a new migration file
     */
    migrator.on('migration:start', (file) => {
      processedFiles.add(file.file.name)

      if (!this.compactOutput) {
        this.printLogMessage(file, migrator.direction)
      }
    })

    /**
     * Migration completed
     */
    migrator.on('migration:completed', (file) => {
      if (!this.compactOutput) {
        this.printLogMessage(file, migrator.direction)
        this.logger.logUpdatePersist()
      }
    })

    /**
     * Migration error
     */
    migrator.on('migration:error', (file) => {
      if (!this.compactOutput) {
        this.printLogMessage(file, migrator.direction)
        this.logger.logUpdatePersist()
      }
    })

    /**
     * Migration completed
     */
    migrator.on('start', () => (start = process.hrtime()))
    migrator.on('end', () => (duration = process.hrtime(start)))

    /**
     * Run migrations
     */
    await migrator.run()

    /**
     * Log all pending files. This will happen, when one of the migration
     * fails with an error and then the migrator stops emitting events.
     */
    Object.keys(migrator.migratedFiles).forEach((file) => {
      if (!processedFiles.has(file) && !this.compactOutput) {
        this.printLogMessage(migrator.migratedFiles[file], migrator.direction)
      }
    })

    if (this.compactOutput) {
      this.logCompactFinalStatus(processedFiles, migrator, duration)
    } else {
      this.logVerboseFinalStatus(migrator, duration)
    }
  }
}

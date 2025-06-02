import { flags } from '@adonisjs/core/ace'
import MigrationsBase from './_base.js'
import { MigrationRunner } from '../../src/migration/runner.js'
import { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * The command is meant to migrate the ClickHouse database by executing
 * migrations in `down` direction.
 */
export default class Rollback extends MigrationsBase {
  static commandName = 'clickhouse:migration:rollback'
  static description = 'Rollback migrations to a specific batch number'
  static options: CommandOptions = {
    startApp: true,
  }

  private migrator?: MigrationRunner

  /**
   * Custom connection for running migrations.
   */
  @flags.string({ description: 'Define a custom clickhouse connection', alias: 'c' })
  declare connection: string

  /**
   * Force run migrations in production
   */
  @flags.boolean({ description: 'Explicitly force to run migrations in production' })
  declare force: boolean

  /**
   * Perform dry run
   */
  @flags.boolean({ description: 'Do not run actual queries. Instead view the SQL output' })
  declare dryRun: boolean

  /**
   * Define custom batch, instead of rolling back to the latest batch
   */
  @flags.number({
    description: 'Define custom batch number for rollback. Use 0 to rollback to initial state',
  })
  declare batch: number

  /**
   * Define custom step, instead of rolling back to the latest batch
   */
  @flags.number({
    description: 'The number of migrations to be reverted',
  })
  declare step: number

  /**
   * Display migrations result in one compact single-line output
   */
  @flags.boolean({ description: 'A compact single-line output' })
  declare compactOutput: boolean

  /**
   * Instantiating the migrator instance
   */
  private async instantiateMigrator() {
    const clickhouse = await this.app.container.make('clickhouse')

    this.migrator = new MigrationRunner(clickhouse, this.app, {
      direction: 'down',
      connectionName: this.connection,
      batch: this.batch,
      step: this.step,
      dryRun: this.dryRun,
    })
  }

  /**
   * Run as a subcommand. Never close clickhouse connections or exit
   * process inside this method
   */
  private async runAsSubCommand() {
    const clickhouse = await this.app.container.make('clickhouse')
    this.connection = this.connection || clickhouse.primaryConnectionName

    /**
     * Continue with migrations when not in prod or force flag
     * is passed
     */
    let continueMigrations = !this.app.inProduction || this.force
    if (!continueMigrations) {
      continueMigrations = await this.takeProductionConsent()
    }

    /**
     * Do not continue when in prod and the prompt was cancelled
     */
    if (!continueMigrations) {
      return
    }

    /**
     * Invalid clickhouse connection
     */
    if (!clickhouse.manager.has(this.connection)) {
      this.printNotAValidConnection(this.connection)
      this.exitCode = 1
      return
    }

    await this.instantiateMigrator()
    await this.runMigrations(this.migrator!, this.connection)
  }

  /**
   * Branching out, so that if required we can implement
   * "runAsMain" separately from "runAsSubCommand".
   *
   * For now, they both are the same
   */
  private runAsMain() {
    return this.runAsSubCommand()
  }

  /**
   * Handle command
   */
  async run(): Promise<void> {
    if (this.isMain) {
      await this.runAsMain()
    } else {
      await this.runAsSubCommand()
    }
  }

  /**
   * Lifecycle method invoked by ace after the "run"
   * method.
   */
  async completed() {
    if (this.migrator && this.isMain) {
      await this.migrator.close()
    }
  }
}

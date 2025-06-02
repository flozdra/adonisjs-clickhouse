import { flags, BaseCommand } from '@adonisjs/core/ace'
import { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * This command reset the ClickHouse database by rolling back to batch 0
 * and then re-run all migrations.
 */
export default class Refresh extends BaseCommand {
  static commandName = 'clickhouse:migration:refresh'
  static description = 'Rollback and migrate ClickHouse database'
  static options: CommandOptions = {
    startApp: true,
  }

  /**
   * Custom connection for running migrations.
   */
  @flags.string({ description: 'Define a custom clickhouse connection', alias: 'c' })
  declare connection: string

  /**
   * Force command execution in production
   */
  @flags.boolean({ description: 'Explicitly force command to run in production' })
  declare force: boolean

  /**
   * Perform dry run
   */
  @flags.boolean({
    description: 'Do not run actual queries. Instead view migrations that would be run',
  })
  declare dryRun: boolean

  /**
   * Run seeders
   */
  @flags.boolean({ description: 'Run seeders' })
  declare seed: boolean

  /**
   * Display migrations result in one compact single-line output
   */
  @flags.boolean({ description: 'A compact single-line output' })
  declare compactOutput: boolean

  /**
   * Converting command properties to arguments
   */
  private getArgs() {
    const args: string[] = []
    if (this.force) {
      args.push('--force')
    }

    if (this.compactOutput) {
      args.push('--compact-output')
    }

    if (this.connection) {
      args.push(`--connection=${this.connection}`)
    }

    if (this.dryRun) {
      args.push('--dry-run')
    }

    return args
  }

  /**
   * Reset all migrations
   */
  private async resetMigrations() {
    const reset = await this.kernel.exec('clickhouse:migration:reset', this.getArgs())
    this.exitCode = reset.exitCode
    this.error = reset.error
  }

  /**
   * Run migrations
   */
  private async runMigrations() {
    const migrate = await this.kernel.exec('clickhouse:migration:run', this.getArgs())
    this.exitCode = migrate.exitCode
    this.error = migrate.error
  }

  /**
   * Run seeders
   */
  private async runDbSeed() {
    const args: string[] = []
    if (this.connection) {
      args.push(`--connection=${this.connection}`)
    }

    const dbSeed = await this.kernel.exec('clickhouse:db:seed', args)
    this.exitCode = dbSeed.exitCode
    this.error = dbSeed.error
  }

  /**
   * Handle command
   */
  async run(): Promise<void> {
    await this.resetMigrations()
    if (this.exitCode) {
      return
    }

    await this.runMigrations()
    if (this.exitCode) {
      return
    }

    if (this.seed) {
      await this.runDbSeed()
    }
  }
}

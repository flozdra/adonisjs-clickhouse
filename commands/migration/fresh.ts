import { flags, BaseCommand } from '@adonisjs/core/ace'
import { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * This command reset the ClickHouse database by rolling back to batch 0
 * and then re-run all migrations.
 */
export default class Fresh extends BaseCommand {
  static commandName = 'clickhouse:migration:fresh'
  static description = 'Drop all tables and re-migrate the ClickHouse database'
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
   * Run seeders
   */
  @flags.boolean({ description: 'Run seeders' })
  declare seed: boolean

  /**
   * Converting command properties to arguments
   */
  private getArgs() {
    const args: string[] = []
    if (this.force) {
      args.push('--force')
    }

    if (this.connection) {
      args.push(`--connection=${this.connection}`)
    }

    return args
  }

  /**
   * Wipe the database
   */
  private async runDbWipe() {
    const dbWipe = await this.kernel.exec('clickhouse:db:wipe', this.getArgs())
    this.exitCode = dbWipe.exitCode
    this.error = dbWipe.error
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
    await this.runDbWipe()
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

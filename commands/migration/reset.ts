import { BaseCommand, flags } from '@adonisjs/core/ace'
import { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * This command resets the ClickHouse database by rolling back to batch 0.
 * Same as calling "clickhouse:migration:rollback --batch=0"
 */
export default class Reset extends BaseCommand {
  static commandName = 'clickhouse:migration:reset'
  static description = 'Rollback all migrations'
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
  @flags.boolean({ description: 'Do not run actual queries. Instead view the SQL output' })
  declare dryRun: boolean

  /**
   * Display migrations result in one compact single-line output
   */
  @flags.boolean({ description: 'A compact single-line output' })
  declare compactOutput: boolean

  /**
   * Converting command properties to arguments
   */
  private getArgs() {
    const args: string[] = ['--batch=0']
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
   * Handle command
   */
  async run(): Promise<void> {
    const rollback = await this.kernel.exec('clickhouse:migration:rollback', this.getArgs())
    this.exitCode = rollback.exitCode
    this.error = rollback.error
  }
}

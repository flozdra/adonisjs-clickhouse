import { BaseCommand, flags } from '@adonisjs/core/ace'
import { CommandOptions } from '@adonisjs/core/types/ace'
import { MethodClientContract } from '../src/types/method.js'

export default class DbTruncate extends BaseCommand {
  static commandName = 'clickhouse:db:truncate'
  static description = 'Truncate all tables in ClickHouse database'
  static options: CommandOptions = {
    startApp: true,
  }

  /**
   * Choose a custom pre-defined connection. Otherwise, we use the
   * default connection
   */
  @flags.string({ description: 'Define a custom clickhouse connection', alias: 'c' })
  declare connection: string

  /**
   * Force command execution in production
   */
  @flags.boolean({ description: 'Explicitly force command to run in production' })
  declare force: boolean

  /**
   * Not a valid connection
   */
  private printNotAValidConnection(connection: string) {
    this.logger.error(
      `"${connection}" is not a valid connection name. Double check "config/clickhouse" file`
    )
  }

  /**
   * Prompts to take consent when truncating the database in production
   */
  private async takeProductionConsent(): Promise<boolean> {
    const question =
      'You are in production environment. Want to continue truncating the ClickHouse database?'
    try {
      return await this.prompt.confirm(question)
    } catch (error) {
      return false
    }
  }

  /**
   * Truncate all tables except adonis migrations table
   */
  private async performTruncate(client: MethodClientContract) {
    const database = client.connection.config.database || 'default'
    const clusterClause = client.connection.config.clusterName
      ? ` ON CLUSTER ${client.connection.config.clusterName}`
      : ''

    let tables = await client
      .query({
        query: 'SELECT name FROM system.tables WHERE database={database:String};',
        query_params: { database },
      })
      .toJSONEachRow<{ name: string }>()

    tables = tables.filter((t) => !['adonis_schema', 'adonis_schema_versions'].includes(t.name))

    await Promise.all(
      tables.map((table) =>
        client.command({ query: `TRUNCATE TABLE ${table.name} ${clusterClause};` })
      )
    )
    this.logger.success('Truncated tables successfully')
  }

  /**
   * Run as a subcommand. Never close clickhouse connections or exit
   * process inside this method
   */
  private async runAsSubCommand() {
    const clickhouse = await this.app.container.make('clickhouse')
    this.connection = this.connection || clickhouse.primaryConnectionName
    const connection = clickhouse.connection(this.connection)

    /**
     * Continue with clearing the database when not in production
     * or force flag is passed
     */
    let continueTruncate = !this.app.inProduction || this.force
    if (!continueTruncate) {
      continueTruncate = await this.takeProductionConsent()
    }

    /**
     * Do not continue when in prod and the prompt was cancelled
     */
    if (!continueTruncate) {
      return
    }

    /**
     * Invalid clickhouse connection
     */
    const managerConnection = clickhouse.manager.get(this.connection)
    if (!managerConnection) {
      this.printNotAValidConnection(this.connection)
      this.exitCode = 1
      return
    }

    await this.performTruncate(connection)
  }

  /**
   * Branching out, so that if required we can implement
   * "runAsMain" separately from "runAsSubCommand".
   *
   * For now, they both are the same
   */
  private async runAsMain() {
    await this.runAsSubCommand()
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
    if (this.isMain) {
      const clickhouse = await this.app.container.make('clickhouse')
      await clickhouse.manager.closeAll(true)
    }
  }
}

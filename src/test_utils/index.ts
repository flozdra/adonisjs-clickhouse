import { ApplicationService } from '@adonisjs/core/types'

/**
 * ClickHouse test utils are meant to be used during testing to
 * perform common tasks like running migrations, seeds, etc.
 */
export class ClickHouseTestUtils {
  constructor(
    protected app: ApplicationService,
    protected connectionName?: string
  ) {}

  /**
   * Runs a command through Ace
   */
  async #runCommand(commandName: string, args: string[] = []) {
    if (this.connectionName) {
      args.push(`--connection=${this.connectionName}`)
    }

    const ace = await this.app.container.make('ace')
    const command = await ace.exec(commandName, args)
    if (!command.exitCode) return

    if (command.error) {
      throw command.error
    } else {
      throw new Error(`"${commandName}" failed`)
    }
  }

  /**
   * Testing hook for running migrations ( if needed )
   * Return a function to truncate the whole database but keep the schema
   */
  async truncate() {
    await this.#runCommand('clickhouse:migration:run', ['--compact-output'])
    return () => this.#runCommand('clickhouse:db:truncate')
  }

  /**
   * Testing hook for running seeds
   */
  async seed() {
    await this.#runCommand('clickhouse:db:seed')
  }

  /**
   * Testing hook for running migrations
   * Return a function to rollback the whole database
   *
   * Note that this is slower than truncate() because it
   * has to run all migration in both directions when running tests
   */
  async migrate() {
    await this.#runCommand('clickhouse:migration:run', ['--compact-output'])
    return () => this.#runCommand('clickhouse:migration:reset', ['--compact-output'])
  }
}

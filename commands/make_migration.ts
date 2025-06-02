import { CommandOptions } from '@adonisjs/core/types/ace'
import { stubsRoot } from '../stubs/main.js'
import { args, BaseCommand, flags } from '@adonisjs/core/ace'
import stringHelpers from '@adonisjs/core/helpers/string'

export default class MakeMigration extends BaseCommand {
  static commandName = 'clickhouse:make:migration'
  static description = 'Make a new migration file'
  static options: CommandOptions = {
    startApp: true,
    allowUnknownFlags: true,
  }

  /**
   * The name of the migration file. We use this to create the migration
   * file and generate the table name
   */
  @args.string({ description: 'Name of the migration file' })
  declare name: string

  /**
   * Choose a custom pre-defined connection. Otherwise, we use the
   * default connection
   */
  @flags.string({
    description: 'Select clickhouse connection for which to create the migration',
  })
  declare connection: string

  /**
   * Pre select migration directory. If this is defined, we will ignore the paths
   * defined inside the config.
   */
  @flags.string({ description: 'Select migration directory (if multiple sources are configured)' })
  declare folder: string

  /**
   * Not a valid connection
   */
  private printNotAValidConnection(connection: string) {
    this.logger.error(
      `"${connection}" is not a valid connection name. Double check "config/clickhouse" file`
    )
  }

  /**
   * Returns the directory for creating the migration file
   */
  private async getDirectory(migrationPaths?: string[]): Promise<string> {
    if (this.folder) {
      return this.folder
    }

    let directories = migrationPaths?.length ? migrationPaths : ['clickhouse/migrations']
    if (directories.length === 1) {
      return directories[0]
    }

    return this.prompt.choice('Select the migrations folder', directories, { name: 'folder' })
  }

  /**
   * Execute command
   */
  async run(): Promise<void> {
    const clickhouse = await this.app.container.make('clickhouse')
    this.connection = this.connection || clickhouse.primaryConnectionName
    const connection = clickhouse.getRawConnection(
      this.connection || clickhouse.primaryConnectionName
    )

    /**
     * Invalid connection
     */
    if (!connection) {
      this.printNotAValidConnection(this.connection)
      this.exitCode = 1
      return
    }

    /**
     * The folder for creating the schema file
     */
    const folder = await this.getDirectory((connection.config.migrations || {}).paths)

    const prefix = new Date().getTime()

    const entity = this.app.generators.createEntity(this.name)
    const fileName = `${prefix}_${stringHelpers.snakeCase(entity.name)}.ts`

    const codemods = await this.createCodemods()
    await codemods.makeUsingStub(stubsRoot, 'make/migration/main.stub', {
      folder,
      path: entity.path,
      fileName,
      flags: this.parsed.flags,
    })
  }
}

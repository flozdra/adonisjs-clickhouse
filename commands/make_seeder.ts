import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import { stubsRoot } from '../stubs/main.js'
import { CommandOptions } from '@adonisjs/core/types/ace'

export default class MakeSeeder extends BaseCommand {
  static commandName = 'clickhouse:make:seeder'
  static description = 'Make a new Seeder file'

  static options: CommandOptions = {
    allowUnknownFlags: true,
  }

  /**
   * The name of the seeder file.
   */
  @args.string({ description: 'Name of the seeder class' })
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
   * Pre select seeder directory. If this is defined, we will ignore the paths
   * defined inside the config.
   */
  @flags.string({ description: 'Select seeder directory (if multiple sources are configured)' })
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
  private async getDirectory(seederPaths?: string[]): Promise<string> {
    if (this.folder) {
      return this.folder
    }

    let directories = seederPaths?.length ? seederPaths : ['clickhouse/seeders']
    if (directories.length === 1) {
      return directories[0]
    }

    return this.prompt.choice('Select the seeder folder', directories, { name: 'folder' })
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
     * The folder for creating the seeder file
     */
    const folder = await this.getDirectory((connection.config.seeders || {}).paths)

    const entity = this.app.generators.createEntity(this.name)

    const codemods = await this.createCodemods()
    await codemods.makeUsingStub(stubsRoot, 'make/seeder/main.stub', {
      folder,
      path: entity.path,
      name: entity.name,
      flags: this.parsed.flags,
    })
  }
}

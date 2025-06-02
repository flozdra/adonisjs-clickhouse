import { Application } from '@adonisjs/core/app'
import { SeedersSource } from './source.js'
import { MethodClientContract } from '../types/method.js'
import { ConnectionConfig, FileNode } from '../types/index.js'
import { ClickHouse } from '../clickhouse/main.js'
import { SeederConstructorContract, SeederFileNode } from '../types/seeder.js'

/**
 * Seeds Runner exposes the API to traverse seeders and execute them
 * in bulk
 */
export class SeedsRunner {
  private client: MethodClientContract
  private config: ConnectionConfig

  nodeEnvironment: string

  constructor(
    private clickhouse: ClickHouse,
    private app: Application<any>,
    private connectionName?: string
  ) {
    this.client = this.clickhouse.connection(
      this.connectionName || this.clickhouse.primaryConnectionName
    )
    this.config = this.clickhouse.getRawConnection(this.client.connection.name)!.config
    this.nodeEnvironment = this.app.nodeEnvironment
  }

  /**
   * Returns the seeder source by ensuring value is a class constructor
   */
  private async getSeederSource(file: FileNode<unknown>): Promise<SeederConstructorContract> {
    const source = await file.getSource()
    if (typeof source === 'function') {
      return source as SeederConstructorContract
    }

    throw new Error(`Invalid schema class exported by "${file.name}"`)
  }

  /**
   * Returns an array of seeders
   */
  async getList() {
    return new SeedersSource(this.config, this.app).getSeeders()
  }

  /**
   * Executes the seeder
   */
  async run(file: FileNode<unknown>): Promise<SeederFileNode> {
    const Source = await this.getSeederSource(file)

    const seeder: SeederFileNode = {
      status: 'pending',
      file: file,
    }

    /**
     * Ignore when the node environment is not the same as the seeder configuration.
     */
    if (Source.environment && !Source.environment.includes(this.nodeEnvironment)) {
      seeder.status = 'ignored'
      return seeder
    }

    try {
      const seederInstance = new Source(this.client)
      if (typeof seederInstance.run !== 'function') {
        throw new Error(`Missing method "run" on "${seeder.file.name}" seeder`)
      }

      await seederInstance.run()
      seeder.status = 'completed'
    } catch (error) {
      seeder.status = 'failed'
      seeder.error = error
    }

    return seeder
  }

  /**
   * Close clickhouse connections
   */
  async close() {
    await this.clickhouse.manager.closeAll(true)
  }
}

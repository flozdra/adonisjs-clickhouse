import { ClickHouseClient, createClient } from '@clickhouse/client'
import { EventEmitter } from 'node:events'
import { ConnectionContract } from '../types/connection.js'
import type { Logger } from '@adonisjs/core/logger'
import { ConnectionConfig } from '../types/index.js'

/**
 * Connection class manages a given database connection. Internally it uses
 * the ClickHouse JS client to build the connection.
 */
export class Connection extends EventEmitter implements ConnectionContract {
  /**
   * The ClickHouse client instance. The instance is created once the `open`
   * method is invoked
   */
  client?: ClickHouseClient

  constructor(
    public name: string,
    public config: ConnectionConfig,
    private logger: Logger
  ) {
    super()
  }

  /**
   * Cleans up reference for the client
   */
  private cleanupClient() {
    this.logger.trace({ connection: this.name }, 'pool destroyed, cleaning up resource')
    this.client = undefined
    this.emit('disconnect', this)
    this.removeAllListeners()
  }

  /**
   * Creates the connection.
   */
  private setupConnection() {
    this.client = createClient(this.config)
  }

  /**
   * Returns a boolean indicating if the connection is ready for making
   * queries. If not, one must call `connect`.
   */
  get ready(): boolean {
    return !!this.client
  }

  /**
   * Opens the connection by creating ClickHouse client instance
   */
  connect() {
    try {
      this.setupConnection()
      this.emit('connect', this)
    } catch (error) {
      this.emit('error', error, this)
      throw error
    }
  }

  /**
   * Closes connection by destroying client instance. The `connection`
   * object must be free for garbage collection.
   *
   * In case of error this method will emit `close:error` event followed
   * by the `close` event.
   */
  async disconnect(): Promise<void> {
    this.logger.trace({ connection: this.name }, 'destroying connection')
    this.client?.close()
    if (this.client) {
      try {
        await this.client.close()
        this.cleanupClient()
      } catch (error) {
        this.emit('disconnect:error', error, this)
      }
    }
  }
}

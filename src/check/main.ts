import { BaseCheck, Result } from '@adonisjs/core/health'
import type { HealthCheckResult } from '@adonisjs/core/types/health'
import { MethodClientContract } from '../types/method.js'

/**
 * The ClickHouseCheck attempts to establish the database connection by
 * executing a ping.
 */
export class ClickHouseCheck extends BaseCheck {
  #client: MethodClientContract

  /**
   * Health check public name
   */
  name: string

  constructor(client: MethodClientContract) {
    super()
    this.#client = client
    this.name = `ClickHouse health check (${client.connection.name})`
  }

  /**
   * Returns connection metadata to be shared in the health checks
   * report
   */
  #getConnectionMetadata() {
    return {
      connection: {
        name: this.#client.connection.name,
      },
    }
  }

  /**
   * Internal method to ping the server and throw an error.
   */
  async #ping() {
    const ping = await this.#client.ping()
    if (!ping.success || ('error' in ping && ping.error)) {
      throw ping.error || new Error('Ping failed')
    }
    return true
  }

  /**
   * Executes the health check
   */
  async run(): Promise<HealthCheckResult> {
    try {
      await this.#ping()
      return Result.ok('Successfully connected to the ClickHouse server').mergeMetaData(
        this.#getConnectionMetadata()
      )
    } catch (error) {
      return Result.failed(error.message || 'Connection failed', error).mergeMetaData(
        this.#getConnectionMetadata()
      )
    }
  }
}

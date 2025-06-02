import Macroable from '@poppinss/macroable'
import type { Emitter } from '@adonisjs/core/events'
import type { Logger } from '@adonisjs/core/logger'
import type { ClickHouseClient } from '@clickhouse/client-common'

import { ConnectionManagerContract } from '../types/connection.js'
import { ClickHouseConfig } from '../types/index.js'
import { ConnectionManager } from '../connection/manager.js'
import {
  CommandContract,
  CommandParams,
  DataFormat,
  ExecContract,
  ExecParams,
  InsertContract,
  InsertParams,
  MethodClientContract,
  PingContract,
  QueryContract,
  QueryParams,
} from '../types/method.js'
import { MethodClient } from '../method/method_client.js'

/**
 * ClickHouse class exposes the API to manage multiple connections and obtain an instance
 * of method clients.
 */
export class ClickHouse extends Macroable {
  /**
   * Reference to connections manager
   */
  manager: ConnectionManagerContract

  /**
   * Primary connection name
   */
  primaryConnectionName: string

  constructor(
    public config: ClickHouseConfig,
    private logger: Logger,
    private emitter: Emitter<any>
  ) {
    super()
    this.manager = new ConnectionManager(this.logger, this.emitter)
    this.primaryConnectionName = this.config.connection

    this.registerConnections()
  }

  /**
   * Registering all connections with the manager, so that we can fetch
   * and connect with them whenver required.
   */
  private registerConnections() {
    Object.keys(this.config.connections).forEach((name) => {
      this.manager.add(name, this.config.connections[name])
    })
  }

  /**
   * Returns the connection node from the connection manager
   */
  getRawConnection(name: string) {
    return this.manager.get(name)
  }

  /**
   * Returns the query builder for a given connection
   */
  connection(connection: string = this.primaryConnectionName): MethodClientContract {
    /**
     * Connect is noop when already connected
     */
    this.manager.connect(connection)

    /**
     * Fetching connection for the given name
     */
    const rawConnection = this.getRawConnection(connection)!.connection!

    /**
     * Generating method client for a given connection
     */
    this.logger.trace({ connection }, 'creating method client')
    const queryBuilder = new MethodClient(rawConnection, this.emitter)

    return queryBuilder
  }

  /** Query method for the primary connection. See {@link ClickHouseClient.query}. */
  query<Format extends DataFormat>(params: QueryParams<Format>): QueryContract<Format> {
    return this.connection(this.primaryConnectionName).query(params)
  }

  /** Insert method for the primary connection. See {@link ClickHouseClient.insert}. */
  insert<T>(params: InsertParams<T>): InsertContract<T> {
    return this.connection(this.primaryConnectionName).insert(params)
  }

  /** Command method for the primary connection. See {@link ClickHouseClient.command}. */
  command(params: CommandParams): CommandContract {
    return this.connection(this.primaryConnectionName).command(params)
  }

  /** Exec method for the primary connection. See {@link ClickHouseClient.exec}. */
  exec(params: ExecParams): ExecContract {
    return this.connection(this.primaryConnectionName).exec(params)
  }

  /** Ping method for the primary connection. See {@link ClickHouseClient.ping}. */
  ping(): PingContract {
    return this.connection(this.primaryConnectionName).ping()
  }

  /**
   * Returns the raw ClickHouse client instance.
   * There will be no events emitted for the method executed.
   */
  rawClient(): ClickHouseClient {
    return this.connection(this.primaryConnectionName).rawClient()
  }
}

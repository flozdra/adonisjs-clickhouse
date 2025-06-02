import { ClickHouseClient } from '@clickhouse/client'
import EventEmitter from 'node:events'
import { ConnectionConfig } from './index.js'

/**
 * Connection represents a single ClickHouse JS client instance
 */
export interface ConnectionContract extends EventEmitter {
  client?: ClickHouseClient

  /**
   * Name of the connection
   */
  readonly name: string

  /**
   * Find if connection is ready or not
   */
  readonly ready: boolean

  /**
   * Untouched config
   */
  config: ConnectionConfig

  /**
   * List of emitted events
   */
  on(event: 'connect', callback: (connection: ConnectionContract) => void): this
  on(event: 'error', callback: (error: Error, connection: ConnectionContract) => void): this
  on(event: 'disconnect', callback: (connection: ConnectionContract) => void): this
  on(
    event: 'disconnect:error',
    callback: (error: Error, connection: ConnectionContract) => void
  ): this

  /**
   * Make client connection
   */
  connect(): void

  /**
   * Disconnect the client
   */
  disconnect(): Promise<void>
}

/**
 * The shape of a connection within the connection manager
 */
export type ConnectionNode = {
  name: string
  config: ConnectionConfig
  connection?: ConnectionContract
  state: 'registered' | 'migrating' | 'open' | 'closing' | 'closed'
}

/**
 * Connection manager to manage one or more connections.
 */
export interface ConnectionManagerContract {
  /**
   * List of registered connection. You must check the connection state
   * to understand, if it is connected or not
   */
  connections: Map<string, ConnectionNode>

  /**
   * Add a new connection to the list of managed connection. You must call
   * connect separately to instantiate a connection instance
   */
  add(connectionName: string, config: ConnectionConfig): void

  /**
   * Instantiate a connection. It is a noop, when connection for the given
   * name is already instantiated
   */
  connect(connectionName: string): void

  /**
   * Get connection node
   */
  get(connectionName: string): ConnectionNode | undefined

  /**
   * Find if a connection name is managed by the manager or not
   */
  has(connectionName: string): boolean

  /**
   * Patch the existing connection config. This triggers the disconnect on the
   * old connection
   */
  patch(connectionName: string, config: ConnectionConfig): void

  /**
   * Find if a managed connection is instantiated or not
   */
  isConnected(connectionName: string): boolean

  /**
   * Close a given connection.
   */
  close(connectionName: string, release?: boolean): Promise<void>

  /**
   * Close all managed connections
   */
  closeAll(release?: boolean): Promise<void>

  /**
   * Release a given connection. Releasing a connection means, you will have to
   * re-add it using the `add` method
   */
  release(connectionName: string): Promise<void>
}

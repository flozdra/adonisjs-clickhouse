import { ApplicationService } from '@adonisjs/core/types'
import { ClickHouse } from '../src/clickhouse/main.js'
import { ClickHouseTestUtils } from '../src/test_utils/index.js'
import type { ClickHouseConfig } from '../src/types/index.js'
import { ConnectionContract } from '../src/types/connection.js'
import { CommandEvent, ExecEvent, InsertEvent, PingEvent, QueryEvent } from '../src/types/method.js'
import {
  prettyPrintCommand,
  prettyPrintExec,
  prettyPrintInsert,
  prettyPrintPing,
  prettyPrintQuery,
} from '../src/helpers/pretty_print.js'

/**
 * Extending AdonisJS types
 */
declare module '@adonisjs/core/types' {
  export interface ContainerBindings {
    clickhouse: ClickHouse
  }
  export interface EventsList {
    'clickhouse:query': QueryEvent
    'clickhouse:command': CommandEvent
    'clickhouse:exec': ExecEvent
    'clickhouse:insert': InsertEvent
    'clickhouse:ping': PingEvent
    'clickhouse:connection:connect': ConnectionContract
    'clickhouse:connection:disconnect': ConnectionContract
    'clickhouse:connection:error': [Error, ConnectionContract]
  }
}

declare module '@adonisjs/core/test_utils' {
  export interface TestUtils {
    clickhouse(connectionName?: string): ClickHouseTestUtils
  }
}

/**
 * ClickHouse service provider
 */
export default class ClickHouseProvider {
  constructor(protected app: ApplicationService) {}

  /**
   * Register ClickHouseTestUtils macro
   */
  protected async registerTestUtils() {
    this.app.container.resolving('testUtils', async () => {
      const { TestUtils } = await import('@adonisjs/core/test_utils')

      TestUtils.macro('clickhouse', () => {
        return new ClickHouseTestUtils(this.app)
      })
    })
  }

  /**
   * Registeres a listener to pretty print debug queries
   */
  protected async prettyPrintDebugQueries(clickhouse: ClickHouse) {
    if (clickhouse.config.prettyPrintDebugQueries) {
      const emitter = await this.app.container.make('emitter')
      emitter.on('clickhouse:query', prettyPrintQuery)
      emitter.on('clickhouse:command', prettyPrintCommand)
      emitter.on('clickhouse:exec', prettyPrintExec)
      emitter.on('clickhouse:insert', prettyPrintInsert)
      emitter.on('clickhouse:ping', prettyPrintPing)
    }
  }

  /**
   * Invoked by AdonisJS to register container bindings
   */
  register() {
    this.app.container.singleton(ClickHouse, async (resolver) => {
      const config = this.app.config.get<ClickHouseConfig>('clickhouse')
      const emitter = await resolver.make('emitter')
      const logger = await resolver.make('logger')
      return new ClickHouse(config, logger, emitter)
    })

    this.app.container.alias('clickhouse', ClickHouse)
  }

  /**
   * Invoked by AdonisJS to extend the framework or pre-configure
   * objects
   */
  async boot() {
    const clickhouse = await this.app.container.make('clickhouse')
    await this.prettyPrintDebugQueries(clickhouse)
    await this.registerTestUtils()
  }

  /**
   * Gracefully close connections during shutdown
   */
  async shutdown() {
    const clickhouse = await this.app.container.make('clickhouse')
    await clickhouse.manager.closeAll()
  }
}

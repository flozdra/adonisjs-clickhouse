import type { Emitter } from '@adonisjs/core/events'
import { ClickHouseClient } from '@clickhouse/client'
import { ConnectionContract } from '../types/connection.js'
import { Query } from './query.js'
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
import { Insert } from './insert.js'
import { Command } from './command.js'
import { Exec } from './exec.js'
import { Ping } from './ping.js'

/**
 * The Method client exposes methods to interact with the database
 */
export class MethodClient implements MethodClientContract {
  constructor(
    public connection: ConnectionContract,
    public emitter: Emitter<any>
  ) {}

  query<Format extends DataFormat>(params: QueryParams<Format>): QueryContract<Format> {
    return new Query(this.connection, this.emitter, params)
  }

  insert<T>(params: InsertParams<T>): InsertContract<T> {
    return new Insert(this.connection, this.emitter, params)
  }

  command(params: CommandParams): CommandContract {
    return new Command(this.connection, this.emitter, params)
  }

  exec(params: ExecParams): ExecContract {
    return new Exec(this.connection, this.emitter, params)
  }

  ping(): PingContract {
    return new Ping(this.connection, this.emitter)
  }

  rawClient(): ClickHouseClient {
    return this.connection.client!
  }
}

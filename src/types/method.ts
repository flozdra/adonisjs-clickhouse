import type * as CHType from '@clickhouse/client'
import type * as CHCommonType from '@clickhouse/client-common'
import type { ClickHouseClient } from '@clickhouse/client-common'

import type { Emitter } from '@adonisjs/core/events'
import type { ConnectionContract } from './connection.js'
import type { Readable } from 'node:stream'

export type DataFormat = CHType.DataFormat

export type QueryParams<Format extends DataFormat> = CHCommonType.QueryParamsWithFormat<Format>
export type QueryResult<Format extends DataFormat> = CHType.ResultSet<Format>

export type InsertParams<T> = CHCommonType.InsertParams<Readable, T>
export type InsertResult = CHCommonType.InsertResult

export type CommandParams = CHCommonType.CommandParams
export type CommandResult = CHCommonType.CommandResult

export type ExecParams = CHCommonType.ExecParams
export type ExecResult = CHCommonType.ExecResult<Readable>

export type PingResult = CHCommonType.PingResult

export interface MethodClientContract {
  connection: ConnectionContract
  emitter: Emitter<any>

  /** See {@link ClickHouseClient.query}. */
  query<Format extends DataFormat>(params: QueryParams<Format>): QueryContract<Format>

  /** See {@link ClickHouseClient.insert}. */
  insert<T>(params: InsertParams<T>): InsertContract<T>

  /** See {@link ClickHouseClient.command}. */
  command(params: CommandParams): CommandContract

  /** See {@link ClickHouseClient.exec}. */
  exec(params: ExecParams): ExecContract

  /** See {@link ClickHouseClient.ping}. */
  ping(): PingContract

  /**
   * Returns the raw ClickHouse client instance.
   * There will be no events emitted for the method executed.
   */
  rawClient(): ClickHouseClient
}

export interface BaseMethodContract<Params, Result> extends Promise<Result> {
  connection: ConnectionContract
  emitter: Emitter<any>
  /**
   * The params for the method
   */
  params: Params

  /**
   * Control whether to debug the query or not. The initial
   * value is inherited from the query client
   */
  debugQueries: boolean

  /**
   * Turn on/off debugging for this query
   */
  debug(debug: boolean): this

  /**
   * Define custom reporter data. It will be merged with
   * the existing data
   */
  reporterData(data: any): this

  /**
   * Executes the query and returns the result
   */
  execute(): Promise<Result>
}

export interface QueryContract<Format extends DataFormat>
  extends BaseMethodContract<QueryParams<Format>, QueryResult<Format>> {
  /**
   * Handy method to set the format to `JSONEachRow`, execute the query and return the result as JSON
   */
  toJSONEachRow<JSONResult>(): Promise<JSONResult[]>
}

export interface InsertContract<T> extends BaseMethodContract<InsertParams<T>, InsertResult> {}

export interface CommandContract extends BaseMethodContract<CommandParams, CommandResult> {}

export interface ExecContract extends BaseMethodContract<ExecParams, ExecResult> {}

export interface PingContract extends BaseMethodContract<undefined, PingResult> {}

/**
 * Shape of the data emitted by the events
 */
export type EventName =
  | 'clickhouse:query'
  | 'clickhouse:insert'
  | 'clickhouse:command'
  | 'clickhouse:exec'
  | 'clickhouse:ping'

type BaseEvent = { connection: string; duration?: [number, number] }

export type QueryEvent = BaseEvent & { query: string; bindings?: Record<string, unknown> }
export type InsertEvent = BaseEvent & { table: string }
export type CommandEvent = BaseEvent & { query: string }
export type ExecEvent = BaseEvent & { query: string; bindings?: Record<string, unknown> }
export type PingEvent = BaseEvent & {}

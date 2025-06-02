import { ExecContract, ExecEvent, ExecParams, ExecResult } from '../types/method.js'
import { MethodRunner } from './method_runner.js'
import type { Emitter } from '@adonisjs/core/events'
import { ConnectionContract } from '../types/connection.js'

export class Exec implements ExecContract {
  /**
   * Custom data someone want to send to the profiler and the
   * query event
   */
  private customReporterData: any

  /**
   * Control whether to debug the query or not. The initial
   * value is inherited from the query client
   */
  debugQueries: boolean

  constructor(
    public connection: ConnectionContract,
    public emitter: Emitter<any>,
    public params: ExecParams
  ) {
    this.debugQueries = !!this.connection.config.debug
  }

  /**
   * Turn on/off debugging for this query
   */
  debug(debug: boolean): this {
    this.debugQueries = debug
    return this
  }

  /**
   * Define custom reporter data. It will be merged with
   * the existing data
   */
  reporterData(data: any) {
    this.customReporterData = data
    return this
  }

  /**
   * Returns the log data
   */
  private getLogData(): ExecEvent {
    return {
      connection: this.connection.name,
      query: this.params.query,
      bindings: this.params.query_params,
      ...this.customReporterData,
    }
  }

  async execute(): Promise<ExecResult> {
    return new MethodRunner(
      'clickhouse:exec',
      this.emitter,
      this.debugQueries,
      this.getLogData()
    ).run(() => this.connection.client!.exec(this.params))
  }

  /**
   * Implementation of `then` for the promise API
   */
  then(resolve: any, reject?: any): any {
    return this.execute().then(resolve, reject)
  }

  /**
   * Implementation of `catch` for the promise API
   */
  catch(reject: any): any {
    return this.execute().catch(reject)
  }

  /**
   * Implementation of `finally` for the promise API
   */
  finally(fulfilled: any) {
    return this.execute().finally(fulfilled)
  }

  /**
   * Required when Promises are extended
   */
  get [Symbol.toStringTag]() {
    return this.constructor.name
  }
}

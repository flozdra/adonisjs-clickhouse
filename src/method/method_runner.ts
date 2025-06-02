import { EventName } from '../types/method.js'
import { MethodReporter } from './method_reporter.js'
import type { Emitter } from '@adonisjs/core/events'

/**
 * Query runner exposes the API for executing a query.
 * Also it will emit the query data and profile the queries as well.
 */
export class MethodRunner {
  private reporter: MethodReporter

  constructor(
    private eventName: EventName,
    private emitter: Emitter<any>,
    private debug: boolean,
    private logData: any
  ) {
    this.reporter = new MethodReporter(this.eventName, this.emitter, this.debug, this.logData)
  }

  /**
   * Executes the query by handling exceptions and returns it back
   * gracefully.
   */
  private async executeQuery<Result>(
    callback: () => Promise<Result>
  ): Promise<[Error | undefined, Result | undefined]> {
    try {
      const result = await callback()
      return [undefined, result]
    } catch (error) {
      return [error, undefined]
    }
  }

  /**
   * Executes the knex builder directly
   */
  private async executeDirectly<Result>(callback: () => Promise<Result>) {
    this.reporter.begin({ ...this.logData })
    const [error, result] = await this.executeQuery(callback)
    this.reporter.end(error)

    if (error) {
      throw error
    }
    return result!
  }

  /**
   * Run query by managing its life-cycle
   */
  async run<Result>(callback: () => Promise<Result>) {
    return this.executeDirectly(callback)
  }
}

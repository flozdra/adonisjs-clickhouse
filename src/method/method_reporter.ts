import type { Emitter } from '@adonisjs/core/events'
import { EventName } from '../types/method.js'

/**
 * Used for reporting methods using the profiler and the event
 * emitter
 */
export class MethodReporter {
  private startTime: [number, number] | undefined
  private isReady = false

  constructor(
    private eventName: EventName,
    private emitter: Emitter<any>,
    private debug: boolean,
    private data: any
  ) {}

  /**
   * Initiate the hrtime when there are one or more query listeners
   */
  private initStartTime() {
    if (!this.emitter.hasListeners(this.eventName) || !this.debug) {
      return
    }
    this.startTime = process.hrtime()
  }

  /**
   * Emit the query with duration
   */
  private emitQueryEvent(error?: Error) {
    if (!this.startTime) {
      return
    }

    const eventData = { duration: process.hrtime(this.startTime), ...this.data, error }
    this.emitter.emit(this.eventName, eventData)
  }

  /**
   * Begin query reporting. Data passed to this method will
   * overwrite the existing data object
   */
  begin(data?: any): this {
    this.isReady = true
    this.data = data || this.data
    this.initStartTime()
    return this
  }

  /**
   * End query reporting
   */
  end(error?: Error) {
    if (!this.isReady) {
      return
    }
    this.emitQueryEvent(error)
  }
}

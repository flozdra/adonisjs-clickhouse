import type { Logger as PinoLogger } from '@adonisjs/core/logger'

/**
 * Custom knex logger that uses adonisjs logger under the
 * hood.
 */
export class Logger {
  warn = function (this: Logger, message: any) {
    this.adonisLogger.warn(message)
  }.bind(this)

  error = function (this: Logger, message: any) {
    this.adonisLogger.error(message)
  }.bind(this)

  deprecate = function (this: Logger, message: any) {
    this.adonisLogger.info(message)
  }.bind(this)

  debug = function (this: Logger, message: any) {
    this.warn(
      '"debug" property inside config is depreciated. We recommend using "clickhouse:query" events for enrich logging'
    )
    this.adonisLogger.debug(message)
  }.bind(this)

  constructor(
    public name: string,
    public adonisLogger: PinoLogger
  ) {}
}

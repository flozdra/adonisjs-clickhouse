import { Exception } from '@poppinss/utils'
import { MethodClientContract } from '../types/method.js'

/**
 * Exposes the API to define table schema using deferred database
 * calls.
 */
export class BaseSchema {
  /**
   * The state of the schema. It cannot be re-executed after completion
   */
  private state: 'pending' | 'completed' = 'pending'

  /**
   * Control whether to debug the query or not. The initial
   * value is inherited from the query client
   */
  debug: boolean

  constructor(
    public client: MethodClientContract,
    public file: string,
    public dryRun: boolean = false
  ) {
    this.debug = !!this.client.connection.config.debug
  }

  /**
   * Invokes schema `up` method, except when `dryRun` is set to true.
   */
  async execUp() {
    if (this.state === 'completed') {
      throw new Exception('Cannot execute a given schema twice')
    }

    this.state = 'completed'

    if (this.dryRun) {
      return this.up.toString()
    }

    await this.up()
    return true
  }

  /**
   * Invokes schema `down` method. Returns an array of queries
   * when `dryRun` is set to true
   */
  async execDown() {
    if (this.state === 'completed') {
      throw new Exception('Cannot execute a given schema twice')
    }

    this.state = 'completed'

    if (this.dryRun) {
      return this.down.toString()
    }

    await this.down()
    this.state = 'completed'
    return true
  }

  async up() {}
  async down() {}
}

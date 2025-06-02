import { FileNode } from './index.js'
import { MethodClientContract } from './method.js'

/**
 * Seeders config
 */
export type SeedersConfig = {
  /**
   * Path to the seeders directory
   * @default ['clickhouse/seeders']
   */
  paths: string[]
}

/**
 * Shape of file node returned by the run method
 */
export type SeederFileNode = {
  status: 'pending' | 'completed' | 'failed' | 'ignored'
  error?: any
  file: FileNode<unknown>
}

export type SeederConstructorContract = {
  environment: string[]
  new (client: MethodClientContract): {
    client: MethodClientContract
    run(): Promise<void>
  }
}

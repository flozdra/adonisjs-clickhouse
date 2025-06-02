import type { Application } from '@adonisjs/core/app'
import { sourceFiles } from '../helpers/source_files.js'
import { ConnectionConfig, FileNode } from '../types/index.js'

/**
 * Migration source exposes the API to read the migration files
 * from disk for a given connection.
 */
export class MigrationSource {
  constructor(
    private config: ConnectionConfig,
    private app: Application<any>
  ) {}

  /**
   * Returns an array of files inside a given directory. Relative
   * paths are resolved from the project root
   */
  private async getDirectoryFiles(directoryPath: string): Promise<FileNode<unknown>[]> {
    const { files } = await sourceFiles(
      this.app.appRoot,
      directoryPath,
      this.config.migrations?.naturalSort || false
    )

    return files
  }

  /**
   * Returns an array of migrations paths for a given connection. If paths
   * are not defined, then `clickhouse/migrations` fallback is used
   */
  private getMigrationsPath(): string[] {
    const directories = (this.config.migrations || {}).paths
    return directories && directories.length ? directories : ['./clickhouse/migrations']
  }

  /**
   * Returns an array of files for all defined directories
   */
  async getMigrations() {
    const migrationPaths = this.getMigrationsPath()
    const directories = await Promise.all(
      migrationPaths.map((directoryPath) => {
        return this.getDirectoryFiles(directoryPath)
      })
    )

    return directories.reduce((result, directory) => {
      result = result.concat(directory)
      return result
    }, [])
  }
}

import slash from 'slash'
import { join, extname } from 'node:path'
import { fsReadAll, isScriptFile } from '@poppinss/utils'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { FileNode } from '../types/index.js'

/**
 * Sources files from a given directory
 */
export async function sourceFiles(
  fromLocation: URL,
  directory: string,
  naturalSort: boolean
): Promise<{ directory: string; files: FileNode<unknown>[] }> {
  const absDirectoryPath = fileURLToPath(new URL(directory, fromLocation))
  let files = await fsReadAll(absDirectoryPath, {
    filter: isScriptFile,
    ignoreMissingRoot: true,
  })

  /**
   * Sort files
   */
  if (naturalSort) {
    files = files.sort((a: string, b: string) =>
      a!.localeCompare(b!, undefined, { numeric: true, sensitivity: 'base' })
    )
  } else {
    files = files.sort()
  }

  return {
    directory,
    files: files.map((file: string) => {
      const name = join(directory, file.replace(RegExp(`${extname(file)}$`), ''))

      return {
        /**
         * Absolute path to the file. Needed to ready the schema source
         */
        absPath: join(absDirectoryPath, file),

        /**
         * Normalizing name to always have unix slashes.
         */
        name: slash(name),

        /**
         * Import schema file
         */
        async getSource() {
          const exports = await import(pathToFileURL(this.absPath).href)
          if (!exports.default) {
            throw new Error(`Missing default export from "${this.name}" schema file`)
          }

          return exports.default
        },
      }
    }),
  }
}

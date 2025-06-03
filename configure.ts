import type Configure from '@adonisjs/core/commands/configure'
import { stubsRoot } from './stubs/main.js'

/**
 * Configures the package
 */
export async function configure(command: Configure) {
  let shouldInstallPackages: boolean | undefined = command.parsedFlags.install

  /**
   * Prompt when `install` or `--no-install` flags are
   * not used
   */
  if (shouldInstallPackages === undefined) {
    shouldInstallPackages = await command.prompt.confirm(
      'Do you want to install additional packages required by "adonisjs-clickhouse"?'
    )
  }
  const codemods = await command.createCodemods()

  /**
   * Publish config file
   */
  await codemods.makeUsingStub(stubsRoot, `config/clickhouse.stub`, {})

  /**
   * Register commands and provider to the rcfile
   */
  await codemods.updateRcFile((rcFile) => {
    rcFile.addCommand('adonisjs-clickhouse/commands')
    rcFile.addProvider('adonisjs-clickhouse/clickhouse_provider')
  })

  /**
   * Define env variables
   */
  await codemods.defineEnvVariables({
    CLICKHOUSE_URL: 'http://localhost:8123',
    CLICKHOUSE_USER: 'default',
    CLICKHOUSE_PASSWORD: 'password',
    CLICKHOUSE_DB: 'default',
  })

  /**
   * Define env variables validations
   */
  await codemods.defineEnvValidations({
    leadingComment: 'Variables for configuring ClickHouse connection',
    variables: {
      CLICKHOUSE_URL: `Env.schema.string({ format: 'url', tld: false })`,
      CLICKHOUSE_USER: 'Env.schema.string()',
      CLICKHOUSE_PASSWORD: 'Env.schema.string.optional()',
      CLICKHOUSE_DB: 'Env.schema.string()',
    },
  })

  /**
   * Install packages or share instructions to install them
   */
  const packagesToInstall: { name: string; isDevDependency: boolean }[] = [
    { name: '@clickhouse/client', isDevDependency: false },
  ]
  if (shouldInstallPackages) {
    await codemods.installPackages(packagesToInstall)
  } else {
    await codemods.listPackagesToInstall(packagesToInstall)
  }
}

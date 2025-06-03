import { test } from '@japa/runner'
import { fileURLToPath } from 'node:url'
import { IgnitorFactory } from '@adonisjs/core/factories'
import Configure from '@adonisjs/core/commands/configure'

const BASE_URL = new URL('./tmp/', import.meta.url)

test.group('Configure', (group) => {
  group.each.setup(({ context }) => {
    context.fs.baseUrl = BASE_URL
    context.fs.basePath = fileURLToPath(BASE_URL)
  })

  group.each.disableTimeout()

  test('create config file and register provider', async ({ fs, assert }) => {
    const ignitor = new IgnitorFactory()
      .withCoreProviders()
      .withCoreConfig()
      .create(BASE_URL, {
        importer: (filePath) => {
          if (filePath.startsWith('./') || filePath.startsWith('../')) {
            return import(new URL(filePath, BASE_URL).href)
          }

          return import(filePath)
        },
      })

    const app = ignitor.createApp('web')
    await app.init()
    await app.boot()

    await fs.create('.env', '')
    await fs.createJson('tsconfig.json', {})
    await fs.create('start/env.ts', `export default Env.create(new URL('./'), {})`)
    await fs.create('adonisrc.ts', `export default defineConfig({})`)

    const ace = await app.container.make('ace')
    ace.prompt
      .trap('Do you want to install additional packages required by "adonisjs-clickhouse"?')
      .reject()

    const command = await ace.create(Configure, ['../../index.js'])
    await command.exec()

    await assert.fileExists('config/clickhouse.ts')
    await assert.fileExists('adonisrc.ts')
    await assert.fileContains('adonisrc.ts', 'adonisjs-clickhouse/commands')
    await assert.fileContains('adonisrc.ts', 'adonisjs-clickhouse/clickhouse_provider')
    await assert.fileContains('config/clickhouse.ts', 'defineConfig({')

    await assert.fileContains('.env', 'CLICKHOUSE_URL')
    await assert.fileContains('.env', 'CLICKHOUSE_USER')
    await assert.fileContains('.env', 'CLICKHOUSE_PASSWORD')
    await assert.fileContains('.env', 'CLICKHOUSE_DB')

    await assert.fileContains(
      'start/env.ts',
      `CLICKHOUSE_URL: Env.schema.string({ format: 'url', tld: false })`
    )
    await assert.fileContains('start/env.ts', 'CLICKHOUSE_USER: Env.schema.string()')
    await assert.fileContains('start/env.ts', 'CLICKHOUSE_PASSWORD: Env.schema.string.optional()')
    await assert.fileContains('start/env.ts', 'CLICKHOUSE_DB: Env.schema.string()')
  })
})

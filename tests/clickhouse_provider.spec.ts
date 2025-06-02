import { test } from '@japa/runner'
import { IgnitorFactory } from '@adonisjs/core/factories'

import { defineConfig } from '../src/define_config.js'
import { ClickHouse } from '../src/clickhouse/main.js'
import { getConnectionConfig } from '../test-helpers/index.js'

const BASE_URL = new URL('./tmp/', import.meta.url)
const IMPORTER = (filePath: string) => {
  if (filePath.startsWith('./') || filePath.startsWith('../')) {
    return import(new URL(filePath, BASE_URL).href)
  }
  return import(filePath)
}

test.group('ClickHouse Provider', () => {
  test('register clickhouse provider', async ({ assert }) => {
    const ignitor = new IgnitorFactory()
      .merge({
        rcFileContents: {
          providers: [() => import('../providers/clickhouse_provider.js')],
        },
      })
      .withCoreConfig()
      .withCoreProviders()
      .merge({
        config: {
          clickhouse: defineConfig({
            connection: 'primary',
            connections: {
              primary: getConnectionConfig(),
            },
          }),
        },
      })
      .create(BASE_URL, { importer: IMPORTER })

    const app = ignitor.createApp('web')
    await app.init()
    await app.boot()

    assert.instanceOf(await app.container.make('clickhouse'), ClickHouse)
  })

  test('release connection when app is terminating', async ({ assert }) => {
    const ignitor = new IgnitorFactory()
      .merge({
        rcFileContents: {
          providers: [() => import('../providers/clickhouse_provider.js')],
        },
      })
      .withCoreConfig()
      .withCoreProviders()
      .merge({
        config: {
          clickhouse: defineConfig({
            connection: 'primary',
            connections: {
              primary: getConnectionConfig(),
            },
          }),
        },
      })
      .create(BASE_URL, { importer: IMPORTER })

    const app = ignitor.createApp('web')
    await app.init()
    await app.boot()

    const clickhouse = await app.container.make('clickhouse')

    await clickhouse.query({ query: 'SELECT 1' })
    await app.terminate()

    assert.isFalse(clickhouse.manager.isConnected('primary'))
  })

  test('register testUtils.clickhouse() binding', async ({ assert }) => {
    const ignitor = new IgnitorFactory()
      .merge({
        rcFileContents: {
          providers: [() => import('../providers/clickhouse_provider.js')],
        },
      })
      .withCoreConfig()
      .withCoreProviders()
      .merge({
        config: {
          clickhouse: defineConfig({
            connection: 'primary',
            connections: {
              primary: getConnectionConfig(),
            },
          }),
        },
      })
      .create(BASE_URL, { importer: IMPORTER })

    const app = ignitor.createApp('web')
    await app.init()
    await app.boot()

    const testUtils = await app.container.make('testUtils')

    assert.isDefined(testUtils.clickhouse)
    assert.isFunction(testUtils.clickhouse)
  })
})

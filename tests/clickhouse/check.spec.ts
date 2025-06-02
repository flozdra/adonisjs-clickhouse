import { test } from '@japa/runner'

import {
  getConnectionConfig,
  setup,
  cleanup,
  logger,
  createEmitter,
} from '../../test-helpers/index.js'
import { ClickHouse } from '../../src/clickhouse/main.js'
import { ClickHouseCheck } from '../../src/check/main.js'

test.group('ClickHouse connection check', (group) => {
  group.setup(async () => {
    await setup()
  })

  group.teardown(async () => {
    await cleanup()
  })

  test('perform health check for a connection', async ({ assert, cleanup: teardown }) => {
    const config = {
      connection: 'primary',
      connections: { primary: getConnectionConfig() },
    }

    const clickhouse = new ClickHouse(config, logger, createEmitter())
    teardown(async () => {
      await clickhouse.manager.closeAll()
    })

    const healthCheck = new ClickHouseCheck(clickhouse.connection())
    const result = await healthCheck.run()
    assert.containsSubset(result, {
      message: 'Successfully connected to the ClickHouse server',
      status: 'ok',
      meta: { connection: { name: 'primary' } },
    })
  })

  test('report error when unable to connect', async ({ assert, cleanup: teardown }) => {
    const config = {
      connection: 'primary',
      connections: {
        primary: Object.assign(getConnectionConfig(), {
          url: 'http://localhost:9999',
        }),
      },
    }

    const clickhouse = new ClickHouse(config, logger, createEmitter())
    teardown(async () => {
      await clickhouse.manager.closeAll()
    })

    const healthCheck = new ClickHouseCheck(clickhouse.connection())
    const result = await healthCheck.run()

    assert.containsSubset(result, {
      message: 'Connection failed',
      status: 'error',
      meta: { connection: { name: 'primary' } },
    })
    assert.equal(result.meta?.error.code, 'ECONNREFUSED')
  })
})

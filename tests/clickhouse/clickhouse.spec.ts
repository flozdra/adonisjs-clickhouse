import { test } from '@japa/runner'

import {
  getConnectionConfig,
  setup,
  cleanup,
  logger,
  createEmitter,
} from '../../test-helpers/index.js'
import { ClickHouse } from '../../src/clickhouse/main.js'
import { Query } from '../../src/method/query.js'
import { Insert } from '../../src/method/insert.js'
import { Exec } from '../../src/method/exec.js'
import { Ping } from '../../src/method/ping.js'
import { Command } from '../../src/method/command.js'

test.group('ClickHouse', (group) => {
  group.setup(async () => {
    await setup()
  })

  group.teardown(async () => {
    await cleanup()
    await cleanup(['events'])
  })

  test('register all connections with the manager', ({ assert }) => {
    const config = {
      connection: 'primary',
      connections: { primary: getConnectionConfig() },
    }

    const clickhouse = new ClickHouse(config, logger, createEmitter())

    assert.isDefined(clickhouse.manager.connections.get('primary'))
    assert.equal(clickhouse.manager.connections.get('primary')!.state, 'registered')
    assert.isUndefined(clickhouse.manager.connections.get('primary')!.connection)
  })

  test('make connection when clickhouse.connection is called', async ({ assert }, done) => {
    assert.plan(1)

    const config = {
      connection: 'primary',
      connections: { primary: getConnectionConfig() },
    }

    const emitter = createEmitter()
    const clickhouse = new ClickHouse(config, logger, emitter)
    emitter.on('clickhouse:connection:connect', (connection) => {
      assert.equal(connection.name, 'primary')
      done()
    })

    clickhouse.connection()
    await clickhouse.manager.closeAll()
  }).waitForDone()

  test('make connection to a named connection', async ({ assert }, done) => {
    assert.plan(1)

    const config = {
      connection: 'primary',
      connections: { primary: getConnectionConfig() },
    }

    const emitter = createEmitter()
    const clickhouse = new ClickHouse(config, logger, emitter)
    emitter.on('clickhouse:connection:connect', (connection) => {
      assert.equal(connection.name, 'primary')
      done()
    })

    clickhouse.connection('primary')
    await clickhouse.manager.closeAll()
  }).waitForDone()

  test('get query instance', async ({ assert }) => {
    const config = {
      connection: 'primary',
      connections: { primary: getConnectionConfig() },
    }

    const clickhouse = new ClickHouse(config, logger, createEmitter())
    const query = clickhouse.query({ query: 'SELECT 1' })
    assert.instanceOf(query, Query)
    await clickhouse.manager.closeAll()
  })

  test('get insert instance', async ({ assert }) => {
    const config = {
      connection: 'primary',
      connections: { primary: getConnectionConfig() },
    }

    const clickhouse = new ClickHouse(config, logger, createEmitter())
    const result = clickhouse.insert({
      table: 'wikistat',
      values: [
        {
          time: new Date().getTime(),
          project: 'test',
          subproject: 'sub',
          path: '/',
          hits: 1,
        },
      ],
      format: 'JSONEachRow',
    })
    assert.instanceOf(result, Insert)
    await clickhouse.manager.closeAll()
  })

  test('get command instance', async ({ assert }) => {
    const config = {
      connection: 'primary',
      connections: { primary: getConnectionConfig() },
    }

    const clickhouse = new ClickHouse(config, logger, createEmitter())
    const command = clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS events
        (id UInt64, name String)
        ORDER BY (id)
      `,
    })
    assert.instanceOf(command, Command)
    await clickhouse.manager.closeAll()
  })

  test('get exec instance', async ({ assert }) => {
    const config = {
      connection: 'primary',
      connections: { primary: getConnectionConfig() },
    }

    const clickhouse = new ClickHouse(config, logger, createEmitter())
    const exex = clickhouse.exec({ query: `SELECT 1;` })
    assert.instanceOf(exex, Exec)
    await clickhouse.manager.closeAll()
  })

  test('get ping instance', async ({ assert }) => {
    const config = {
      connection: 'primary',
      connections: { primary: getConnectionConfig() },
    }

    const clickhouse = new ClickHouse(config, logger, createEmitter())
    const result = clickhouse.ping()
    assert.instanceOf(result, Ping)
    await clickhouse.manager.closeAll()
  })
})

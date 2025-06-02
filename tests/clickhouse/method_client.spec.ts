import { test } from '@japa/runner'

import {
  getConnectionConfig,
  setup,
  cleanup,
  logger,
  createEmitter,
} from '../../test-helpers/index.js'
import { MethodClient } from '../../src/method/method_client.js'
import { Connection } from '../../src/connection/index.js'

test.group('Method client', (group) => {
  group.setup(async () => {
    await setup()
  })

  group.teardown(async () => {
    await cleanup()
    await cleanup(['events'])
  })

  test('perform a query', async ({ assert }) => {
    const connection = new Connection('primary', getConnectionConfig(), logger)
    connection.connect()

    const client = new MethodClient(connection, createEmitter())
    const result = await client.query({ query: 'SELECT 1', format: 'JSON' })
    assert.isDefined(result)

    const rows = await result.json<{ '1': number }>()
    assert.strictEqual(rows.rows, 1)
    assert.deepEqual(rows.data, [{ '1': 1 }])

    await connection.disconnect()
  })

  test('perform a query with .toJSONEachRow()', async ({ assert }) => {
    const connection = new Connection('primary', getConnectionConfig(), logger)
    connection.connect()

    const client = new MethodClient(connection, createEmitter())
    const rows = await client.query({ query: 'SELECT 1' }).toJSONEachRow<{ '1': number }>()
    assert.strictEqual(rows.length, 1)
    assert.deepEqual(rows, [{ '1': 1 }])

    await connection.disconnect()
  })

  test('perform an insert', async ({ assert }) => {
    const connection = new Connection('primary', getConnectionConfig(), logger)
    connection.connect()

    const client = new MethodClient(connection, createEmitter())
    const result = await client.insert({
      table: 'wikistat',
      values: [
        { time: new Date().getTime(), project: 'test', subproject: 'sub', path: '/', hits: 1 },
      ],
      format: 'JSONEachRow',
    })
    assert.isTrue(result.executed)

    const rows = await client
      .query({ query: 'SELECT project FROM wikistat' })
      .toJSONEachRow<{ project: string }>()

    assert.strictEqual(rows.length, 1)
    assert.deepEqual(rows, [{ project: 'test' }])

    await connection.disconnect()
  })

  test('perform a command', async ({ assert }) => {
    const connection = new Connection('primary', getConnectionConfig(), logger)
    connection.connect()

    const client = new MethodClient(connection, createEmitter())
    const result = await client.command({
      query: `
        CREATE TABLE IF NOT EXISTS events
        (id UInt64, name String)
        ORDER BY (id)
      `,
    })
    assert.isDefined(result.query_id)

    await connection.disconnect()
  })

  test('perform an exec', async ({ assert }) => {
    const connection = new Connection('primary', getConnectionConfig(), logger)
    connection.connect()

    const client = new MethodClient(connection, createEmitter())
    const result = await client.exec({ query: `SELECT 1;` })
    assert.isDefined(result.query_id)

    result.stream.destroy()
    await connection.disconnect()
  })

  test('perform a ping', async ({ assert }) => {
    const connection = new Connection('primary', getConnectionConfig(), logger)
    connection.connect()

    const client = new MethodClient(connection, createEmitter())
    const result = await client.ping()
    assert.isDefined(result)
    assert.isTrue(result.success)

    await connection.disconnect()
  })
})

import { test } from '@japa/runner'
import { Connection } from '../../src/connection/index.js'
import { cleanup, getConnectionConfig, logger, setup } from '../../test-helpers/index.js'

test.group('Connection | setup', (group) => {
  group.setup(async () => {
    await setup()
  })

  group.teardown(async () => {
    await cleanup()
  })

  test('do not instantiate connection unless connect is called', async ({ assert }) => {
    const connection = new Connection('primary', getConnectionConfig(), logger)
    assert.isUndefined(connection.client)
  })

  test('instantiate connection when connect is invoked', async ({ assert }, done) => {
    const connection = new Connection('primary', getConnectionConfig(), logger)
    connection.on('connect', async () => {
      assert.isDefined(connection.client)
      assert.deepEqual(await connection.client!.ping(), { success: true })
      await connection.disconnect()
      done()
    })

    connection.connect()
  }).waitForDone()

  test('on disconnect destroy client', async ({ assert }) => {
    const connection = new Connection('primary', getConnectionConfig(), logger)
    connection.connect()
    await connection.disconnect()

    assert.isUndefined(connection.client)
  })

  test('on disconnect emit disconnect event', async ({ assert }, done) => {
    const connection = new Connection('primary', getConnectionConfig(), logger)
    connection.connect()

    connection.on('disconnect', () => {
      assert.isUndefined(connection.client)
      done()
    })

    await connection.disconnect()
  }).waitForDone()
})

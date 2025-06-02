import { test } from '@japa/runner'
import { AppFactory } from '@adonisjs/core/factories/app'

import { SeedsRunner } from '../../src/seeders/runner.js'
import {
  getClickHouse,
  setup,
  cleanup as cleanupTables,
  createSeederFile,
} from '../../test-helpers/index.js'

test.group('Seeds Runner', (group) => {
  group.each.setup(async () => {
    await setup()
  })

  group.each.teardown(async () => {
    await cleanupTables()
  })

  test('run a seeder file', async ({ fs, assert, cleanup }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouse()
    cleanup(() => clickhouse.manager.closeAll())

    const runner = new SeedsRunner(clickhouse, app)

    await createSeederFile(
      fs,
      `
        export default class {
          static invoked = false
          run () {
            (this.constructor as any).invoked = true
          }
        }
      `
    )

    const files = await runner.getList()
    const report = await runner.run(files[0])
    const fileSource = await report.file.getSource()

    assert.equal((fileSource as any)['invoked'], true)
    assert.equal(report.status, 'completed')
  })

  test('catch and return seeder errors', async ({ fs, assert }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouse()
    const runner = new SeedsRunner(clickhouse, app)

    await createSeederFile(
      fs,
      `
        export default class {
          run () {
            throw new Error('Failed to run seeder')
          }
        }
      `
    )

    const files = await runner.getList()
    const report = await runner.run(files[0])
    assert.equal(report.status, 'failed')
    assert.exists(report.error)

    await clickhouse.manager.closeAll()
  })
  test('mark file as ignored when "environment = production" and not running in production mode', async ({
    assert,
    fs,
  }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouse()

    const runner = new SeedsRunner(clickhouse, app)
    runner.nodeEnvironment = 'development'

    await createSeederFile(
      fs,
      `
        export default class {
          public static invoked = false
          public static environment = ['production']
          run () {
            (this.constructor as any).invoked = true
          }
        }
      `
    )

    const files = await runner.getList()
    const report = await runner.run(files[0])
    assert.equal(report.status, 'ignored')

    const fileSource = await report.file.getSource()
    assert.equal((fileSource as any)['invoked'], false)

    delete process.env.NODE_ENV
    await clickhouse.manager.closeAll()
  })

  test('mark file as ignored when "environment = development" and not running in development mode', async ({
    assert,
    fs,
  }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouse()

    const runner = new SeedsRunner(clickhouse, app)
    runner.nodeEnvironment = 'production'

    await createSeederFile(
      fs,
      `
        export default class {
          public static invoked = false
          public static environment = ['development']
          run () {
            (this.constructor as any).invoked = true
          }
        }
      `
    )

    const files = await runner.getList()
    const report = await runner.run(files[0])
    assert.equal(report.status, 'ignored')

    const fileSource = await report.file.getSource()
    assert.equal((fileSource as any)['invoked'], false)

    delete process.env.NODE_ENV
    await clickhouse.manager.closeAll()
  })
})

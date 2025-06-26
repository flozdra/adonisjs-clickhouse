import { test } from '@japa/runner'
import { ListLoader } from '@adonisjs/core/ace'
import { AceFactory } from '@adonisjs/core/factories'

import DbSeed from '../commands/db_seed.js'
import { getClickHouse } from '../test-helpers/index.js'
import Reset from '../commands/migration/reset.js'
import Migrate from '../commands/migration/run.js'
import DbTruncate from '../commands/db_truncate.js'
import { AppFactory } from '@adonisjs/core/factories/app'
import { ApplicationService } from '@adonisjs/core/types'
import { ClickHouseTestUtils } from '../src/test_utils/index.js'

test.group('ClickHouse Test Utils', () => {
  test('truncate() should run clickhouse:db:truncate command', async ({ fs, assert }) => {
    let truncateRun = false

    class FakeDbTruncate extends DbTruncate {
      override async run() {
        truncateRun = true
      }
    }

    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    ace.addLoader(new ListLoader([FakeDbTruncate]))

    const app = new AppFactory().create(fs.baseUrl, () => {}) as ApplicationService
    await app.init()

    app.container.bind('clickhouse', () => getClickHouse())
    app.container.bind('ace', () => ace)

    const clickhouseTestUtils = new ClickHouseTestUtils(app)
    const truncate = await clickhouseTestUtils.truncate()

    await truncate()

    assert.isTrue(truncateRun)
  })

  test('truncate() with custom connectionName', async ({ fs, assert }) => {
    assert.plan(1)

    class FakeDbTruncate extends DbTruncate {
      override async run() {
        assert.equal(this.connection, 'secondary')
      }
    }

    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    ace.addLoader(new ListLoader([FakeDbTruncate]))

    const app = new AppFactory().create(fs.baseUrl, () => {}) as ApplicationService
    await app.init()

    app.container.bind('clickhouse', () => getClickHouse())
    app.container.bind('ace', () => ace)

    const clickhouseTestUtils = new ClickHouseTestUtils(app, 'secondary')
    const truncate = await clickhouseTestUtils.truncate()

    await truncate()
  })

  test('seed() should run clickhouse:db:seed command', async ({ fs, assert }) => {
    assert.plan(1)

    class FakeDbSeed extends DbSeed {
      override async run() {
        assert.isTrue(true)
      }
    }

    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    ace.addLoader(new ListLoader([FakeDbSeed]))

    const app = new AppFactory().create(fs.baseUrl, () => {}) as ApplicationService
    await app.init()

    app.container.bind('clickhouse', () => getClickHouse())
    app.container.bind('ace', () => ace)

    const clickhouseTestUtils = new ClickHouseTestUtils(app)
    await clickhouseTestUtils.seed()
  })

  test('seed() with custom connectionName', async ({ fs, assert }) => {
    assert.plan(1)

    class FakeDbSeed extends DbSeed {
      override async run() {
        assert.equal(this.connection, 'secondary')
      }
    }

    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    ace.addLoader(new ListLoader([FakeDbSeed]))

    const app = new AppFactory().create(fs.baseUrl, () => {}) as ApplicationService
    await app.init()

    app.container.bind('clickhouse', () => getClickHouse())
    app.container.bind('ace', () => ace)

    const clickhouseTestUtils = new ClickHouseTestUtils(app, 'secondary')
    await clickhouseTestUtils.seed()
  })

  test('migrate() should run clickhouse:migration:run and clickhouse:migration:reset commands', async ({
    fs,
    assert,
  }) => {
    let migrationRun = false
    let resetRun = false

    class FakeMigrate extends Migrate {
      override async run() {
        migrationRun = true
      }
    }

    class FakeMigrationRollback extends Reset {
      override async run() {
        resetRun = true
      }
    }

    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    ace.addLoader(new ListLoader([FakeMigrate, FakeMigrationRollback]))

    const app = new AppFactory().create(fs.baseUrl, () => {}) as ApplicationService
    await app.init()

    app.container.bind('clickhouse', () => getClickHouse())
    app.container.bind('ace', () => ace)

    const clickhouseTestUtils = new ClickHouseTestUtils(app)
    const rollback = await clickhouseTestUtils.migrate()

    await rollback()

    assert.isTrue(migrationRun)
    assert.isTrue(resetRun)
  })

  test('migrate() with custom connectionName', async ({ fs, assert }) => {
    assert.plan(2)

    class FakeMigrate extends Migrate {
      override async run() {
        assert.equal(this.connection, 'secondary')
      }
    }

    class FakeMigrationRollback extends Reset {
      override async run() {
        assert.equal(this.connection, 'secondary')
      }
    }

    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    ace.addLoader(new ListLoader([FakeMigrate, FakeMigrationRollback]))

    const app = new AppFactory().create(fs.baseUrl, () => {}) as ApplicationService
    await app.init()

    app.container.bind('clickhouse', () => getClickHouse())
    app.container.bind('ace', () => ace)

    const clickhouseTestUtils = new ClickHouseTestUtils(app, 'secondary')
    const rollback = await clickhouseTestUtils.migrate()

    await rollback()
  })

  test('should throw error when command has an exitCode = 1', async ({ fs }) => {
    class FakeMigrate extends Migrate {
      override async run() {
        this.exitCode = 1
      }
    }

    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    ace.addLoader(new ListLoader([FakeMigrate]))

    const app = new AppFactory().create(fs.baseUrl, () => {}) as ApplicationService
    await app.init()

    app.container.bind('clickhouse', () => getClickHouse())
    app.container.bind('ace', () => ace)

    const clickhouseTestUtils = new ClickHouseTestUtils(app)
    await clickhouseTestUtils.migrate()
  }).throws('"clickhouse:migration:run" failed')

  test('should re-use command.error message if available', async ({ fs }) => {
    class FakeMigrate extends Migrate {
      override async run() {
        this.exitCode = 1
        this.error = new Error('Custom error message')
      }
    }

    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    ace.addLoader(new ListLoader([FakeMigrate]))

    const app = new AppFactory().create(fs.baseUrl, () => {}) as ApplicationService
    await app.init()

    app.container.bind('clickhouse', () => getClickHouse())
    app.container.bind('ace', () => ace)

    const clickhouseTestUtils = new ClickHouseTestUtils(app)
    await clickhouseTestUtils.migrate()
  }).throws('Custom error message')
})

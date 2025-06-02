import { test } from '@japa/runner'
import { AceFactory } from '@adonisjs/core/factories'

import Migrate from '../../../commands/migration/run.js'
import {
  setup,
  cleanup as cleanupTables,
  getClickHouse,
  createMigrationFile,
  tableExists,
  getMigrated,
} from '../../../test-helpers/index.js'

test.group('clickhouse:migration:run', (group) => {
  group.each.setup(async () => {
    await setup()
    return async () => {
      await cleanupTables()
      await cleanupTables(['adonis_schema', 'adonis_schema_versions', 'events', 'events_v2'])
    }
  })

  test('run migrations from default directory', async ({ fs, assert }) => {
    const migration1 = await createMigrationFile(fs, 'events')

    const clickhouse = getClickHouse()
    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    await ace.app.init()
    ace.app.container.singleton('clickhouse', () => clickhouse)
    ace.ui.switchMode('raw')

    const migrate = await ace.create(Migrate, [])
    await migrate.exec()

    const migrated = await getMigrated(clickhouse)
    const hasEventsTable = await tableExists(clickhouse, 'events')

    assert.lengthOf(migrated, 1)
    assert.isTrue(hasEventsTable)
    assert.equal(migrated[0].name, migration1)
    assert.equal(migrated[0].batch, 1)
  })

  test('skip migrations when already up to date', async ({ fs, assert }) => {
    const clickhouse = getClickHouse()
    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    await ace.app.init()
    ace.app.container.singleton('clickhouse', () => clickhouse)
    ace.ui.switchMode('raw')

    const migrate = await ace.create(Migrate, [])
    await migrate.exec()

    const migrated = await getMigrated(clickhouse)
    assert.lengthOf(migrated, 0)
  })

  test('do not execute migrations in dry-run', async ({ fs, assert }) => {
    await fs.create(
      'clickhouse/migrations/1_create_events_table.ts',
      `
      import { BaseSchema } from '../../../../src/schema/main.js'
      export default class extends BaseSchema {
        async up() {
          await this.client.command({
            query: "CREATE TABLE events (name LowCardinality(String), time DateTime) ENGINE = MergeTree ORDER BY (name, time);"
          })
        }
      }
    `
    )

    const clickhouse = getClickHouse()
    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    await ace.app.init()
    ace.app.container.singleton('clickhouse', () => clickhouse)
    ace.ui.switchMode('raw')

    const migrate = await ace.create(Migrate, ['--dry-run'])
    await migrate.exec()

    const migrated = await getMigrated(clickhouse)
    assert.lengthOf(migrated, 0)
  })

  test('do not run migrations in production', async ({ fs, assert, cleanup }) => {
    assert.plan(1)
    process.env.NODE_ENV = 'production'
    cleanup(() => {
      delete process.env.NODE_ENV
    })

    await fs.create(
      'clickhouse/migrations/1_create_events_table.ts',
      `
      import { BaseSchema } from '../../../../src/schema/main.js'
      export default class extends BaseSchema {
        async up() {
          await this.client.command({
            query: "CREATE TABLE events (name LowCardinality(String), time DateTime) ENGINE = MergeTree ORDER BY (name, time);"
          })
        }
      }
    `
    )

    const clickhouse = getClickHouse()
    const ace = await new AceFactory().make(fs.baseUrl, {
      importer: (filePath) => {
        return import(filePath)
      },
    })

    await ace.app.init()
    await ace.app.boot()
    ace.app.container.singleton('clickhouse', () => clickhouse)
    ace.ui.switchMode('raw')

    const migrate = await ace.create(Migrate, [])
    migrate.prompt
      .trap('You are in production environment. Want to continue running migrations?')
      .reject()

    await migrate.exec()

    const hasEventsTable = await tableExists(clickhouse, 'events')
    assert.isFalse(hasEventsTable)
  })

  test('run migrations in production when --force flag is passed', async ({
    fs,
    assert,
    cleanup,
  }) => {
    process.env.NODE_ENV = 'production'
    cleanup(() => {
      delete process.env.NODE_ENV
    })

    await fs.create(
      'clickhouse/migrations/1_create_events_table.ts',
      `
      import { BaseSchema } from '../../../../src/schema/main.js'
      export default class extends BaseSchema {
        async up() {
          await this.client.command({
            query: "CREATE TABLE events (name LowCardinality(String), time DateTime) ENGINE = MergeTree ORDER BY (name, time);"
          })
        }
      }
    `
    )

    const clickhouse = getClickHouse()

    const ace = await new AceFactory().make(fs.baseUrl, {
      importer: (filePath) => {
        return import(filePath)
      },
    })
    await ace.app.init()
    ace.app.container.singleton('clickhouse', () => clickhouse)
    ace.ui.switchMode('raw')

    const migrate = await ace.create(Migrate, ['--force'])
    await migrate.exec()

    const migrated = await getMigrated(clickhouse)
    const hasEventsTable = await tableExists(clickhouse, 'events')

    assert.lengthOf(migrated, 1)
    assert.isTrue(hasEventsTable)
    assert.equal(migrated[0].name, 'clickhouse/migrations/1_create_events_table')
    assert.equal(migrated[0].batch, 1)
  })

  test('run migrations with compact output should display one line', async ({ fs }) => {
    await fs.create(
      'clickhouse/migrations/1_create_events_table.ts',
      `
      import { BaseSchema } from '../../../../src/schema/main.js'
      export default class extends BaseSchema {
        async up() {
          await this.client.command({
            query: "CREATE TABLE events (name LowCardinality(String), time DateTime) ENGINE = MergeTree ORDER BY (name, time);"
          })
        }
      }
    `
    )

    await fs.create(
      'clickhouse/migrations/2_create_events_v2_table.ts',
      `
      import { BaseSchema } from '../../../../src/schema/main.js'
      export default class extends BaseSchema {
        async up() {
          await this.client.command({
            query: "CREATE TABLE events_v2 (name LowCardinality(String), time DateTime) ENGINE = MergeTree ORDER BY (name, time);"
          })
        }
      }
    `
    )

    const clickhouse = getClickHouse()
    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    await ace.app.init()
    ace.app.container.singleton('clickhouse', () => clickhouse)
    ace.ui.switchMode('raw')

    const migrate = await ace.create(Migrate, ['--compact-output'])
    await migrate.exec()

    migrate.assertLogMatches(/grey\(❯ Executed 2 migrations/)
  })

  test('run already migrated migrations with compact output should display one line', async ({
    fs,
  }) => {
    await fs.create(
      'clickhouse/migrations/1_create_events_table.ts',
      `
      import { BaseSchema } from '../../../../src/schema/main.js'
      export default class extends BaseSchema {
        async up() {
          await this.client.command({
            query: "CREATE TABLE events (name LowCardinality(String), time DateTime) ENGINE = MergeTree ORDER BY (name, time);"
          })
        }
      }
    `
    )

    await fs.create(
      'clickhouse/migrations/2_create_events_v2_table.ts',
      `
      import { BaseSchema } from '../../../../src/schema/main.js'
      export default class extends BaseSchema {
        async up() {
          await this.client.command({
            query: "CREATE TABLE events_v2 (name LowCardinality(String), time DateTime) ENGINE = MergeTree ORDER BY (name, time);"
          })
        }
      }
    `
    )

    const clickhouse = getClickHouse()
    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    await ace.app.init()
    ace.app.container.singleton('clickhouse', () => clickhouse)
    ace.ui.switchMode('raw')

    const migrate = await ace.create(Migrate, ['--compact-output'])
    await migrate.exec()
    await migrate.exec()

    migrate.assertLogMatches(/grey\(❯ Already up to date/)
  })
})

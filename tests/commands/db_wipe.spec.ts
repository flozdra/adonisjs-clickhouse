import { test } from '@japa/runner'
import { AceFactory } from '@adonisjs/core/factories'

import DbWipe from '../../commands/db_wipe.js'
import Migrate from '../../commands/migration/run.js'
import {
  setup,
  cleanup,
  getClickHouse,
  createMigrationFile,
  tableExists,
} from '../../test-helpers/index.js'

test.group('clickhouse:db:wipe and migrate:fresh', (group) => {
  group.each.setup(async () => {
    await setup()

    return async () => {
      await cleanup()
      await cleanup(['adonis_schema', 'adonis_schema_versions', 'events'])
    }
  })

  test('clickhouse:db:wipe should drop all tables', async ({ fs, assert }) => {
    await createMigrationFile(fs, 'events')

    const clickhouse = getClickHouse()
    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    await ace.app.init()
    ace.app.container.singleton('clickhouse', () => clickhouse)
    ace.ui.switchMode('raw')

    const migrate = await ace.create(Migrate, [])
    await migrate.exec()

    const hasTable = await tableExists(clickhouse, 'events')
    assert.isTrue(hasTable)

    const dbWipe = await ace.create(DbWipe, [])
    await dbWipe.exec()

    const hasTableAfterWip = await tableExists(clickhouse, 'events')
    assert.isFalse(hasTableAfterWip)
  })
})

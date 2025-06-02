import { test } from '@japa/runner'
import { ListLoader } from '@adonisjs/core/ace'
import { AceFactory } from '@adonisjs/core/factories'

import Reset from '../../../commands/migration/reset.js'
import Migrate from '../../../commands/migration/run.js'
import Rollback from '../../../commands/migration/rollback.js'
import {
  cleanup,
  createMigrationFile,
  getClickHouse,
  getMigrated,
  setup,
  tableExists,
} from '../../../test-helpers/index.js'

test.group('clickhouse:migration:reset', (group) => {
  group.each.setup(async () => {
    await setup()

    return async () => {
      await cleanup()
      await cleanup(['adonis_schema', 'adonis_schema_versions', 'events', 'events_v2'])
    }
  })

  test('rollback to batch 0', async ({ fs, assert }) => {
    await createMigrationFile(fs, 'events')
    await createMigrationFile(fs, 'events_v2')

    const clickhouse = getClickHouse()
    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    await ace.app.init()
    ace.app.container.singleton('clickhouse', () => clickhouse)
    ace.ui.switchMode('raw')

    ace.addLoader(new ListLoader([Rollback]))

    const migrate = await ace.create(Migrate, [])
    await migrate.exec()

    const reset = await ace.create(Reset, [])
    await reset.exec()

    const migrated = await getMigrated(clickhouse)
    const hasEvents = await tableExists(clickhouse, 'events')
    const hasEventsV2 = await tableExists(clickhouse, 'events_v2')

    assert.lengthOf(migrated, 0)
    assert.isFalse(hasEvents)
    assert.isFalse(hasEventsV2)
  })
})

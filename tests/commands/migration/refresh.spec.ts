import { test } from '@japa/runner'
import { ListLoader } from '@adonisjs/core/ace'
import { AceFactory } from '@adonisjs/core/factories'

import DbSeed from '../../../commands/db_seed.js'
import Reset from '../../../commands/migration/reset.js'
import Migrate from '../../../commands/migration/run.js'
import Refresh from '../../../commands/migration/refresh.js'
import Rollback from '../../../commands/migration/rollback.js'
import {
  cleanup,
  createMigrationFile,
  createSeederFile,
  getClickHouse,
  getMigrated,
  tableExists,
} from '../../../test-helpers/index.js'

test.group('clickhouse:migration:refresh', (group) => {
  group.each.setup(async () => {
    return async () => {
      await cleanup(['adonis_schema', 'adonis_schema_versions', 'events', 'events_v2'])
    }
  })

  test('rollback to batch 0 and migrate database', async ({ fs, assert }) => {
    await createMigrationFile(fs, 'events')
    await createMigrationFile(fs, 'events_v2')

    const clickhouse = getClickHouse()
    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    await ace.app.init()
    ace.app.container.singleton('clickhouse', () => clickhouse)
    ace.ui.switchMode('raw')

    ace.addLoader(new ListLoader([Reset, DbSeed, Migrate, Rollback]))

    const migrate = await ace.create(Migrate, [])
    await migrate.exec()

    const refresh = await ace.create(Refresh, [])
    await refresh.exec()

    const migrated = await getMigrated(clickhouse)
    const hasEvents = await tableExists(clickhouse, 'events')
    const hasEventsV2 = await tableExists(clickhouse, 'events_v2')

    assert.lengthOf(migrated, 2)
    assert.isTrue(hasEvents)
    assert.isTrue(hasEventsV2)
  })

  test('run seeders when --seed flag is passed', async ({ fs, assert }) => {
    await createSeederFile(
      fs,

      `
        export default class {
          run() { process.env.EXEC_SEEDER = 'true' }
        }
      `
    )

    await createMigrationFile(fs, 'events')

    await createMigrationFile(fs, 'events_v2')

    const clickhouse = getClickHouse()
    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    await ace.app.init()
    ace.app.container.singleton('clickhouse', () => clickhouse)
    ace.ui.switchMode('raw')

    ace.addLoader(new ListLoader([Reset, DbSeed, Migrate, Rollback]))

    const migrate = await ace.create(Migrate, [])
    await migrate.exec()

    const refresh = await ace.create(Refresh, ['--seed'])
    await refresh.exec()

    assert.equal(process.env.EXEC_SEEDER, 'true')
    delete process.env.EXEC_SEEDER
  })
})

import { test } from '@japa/runner'
import { ListLoader } from '@adonisjs/core/ace'
import { AceFactory } from '@adonisjs/core/factories'

import Migrate from '../../../commands/migration/run.js'
import Fresh from '../../../commands/migration/fresh.js'
import DbWipe from '../../../commands/db_wipe.js'
import DbSeed from '../../../commands/db_seed.js'
import {
  cleanup,
  createMigrationFile,
  createSeederFile,
  getClickHouse,
  getMigrated,
  tableExists,
} from '../../../test-helpers/index.js'

test.group('clickhouse:migrate:fresh', (group) => {
  group.each.setup(async () => {
    return async () => {
      await cleanup(['adonis_schema', 'adonis_schema_versions', 'events'])
    }
  })

  test('clickhouse:migration:fresh should drop all tables and run migrations', async ({
    fs,
    assert,
  }) => {
    const migration1 = await createMigrationFile(fs, 'events')

    const clickhouse = getClickHouse()
    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    await ace.app.init()
    ace.app.container.singleton('clickhouse', () => clickhouse)
    ace.ui.switchMode('raw')

    ace.addLoader(new ListLoader([DbWipe, DbSeed, Migrate]))

    const migrate = await ace.create(Migrate, [])
    await migrate.exec()

    const migrated = await getMigrated(clickhouse)
    const hasEventsTable = await tableExists(clickhouse, 'events')

    assert.lengthOf(migrated, 1)
    assert.isTrue(hasEventsTable)
    assert.equal(migrated[0].name, migration1)
    assert.equal(migrated[0].batch, 1)

    const fresh = await ace.create(Fresh, [])
    await fresh.exec()

    const migrated1 = await getMigrated(clickhouse)
    const hasEventsTable1 = await tableExists(clickhouse, 'events')

    assert.lengthOf(migrated1, 1)
    assert.isTrue(hasEventsTable1)
    assert.equal(migrated1[0].name, migration1)
    assert.equal(migrated1[0].batch, 1)
  })

  test('clickhouse:migration:fresh --seed should run seeders', async ({ fs, assert }) => {
    await createSeederFile(
      fs,
      `
        export default class {
          run() { process.env.EXEC_SEEDER = 'true' }
        }
      `
    )
    await createMigrationFile(fs, 'events')

    const clickhouse = getClickHouse()
    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    await ace.app.init()
    ace.app.container.singleton('clickhouse', () => clickhouse)
    ace.ui.switchMode('raw')

    ace.addLoader(new ListLoader([DbWipe, DbSeed, Migrate]))

    const migrate = await ace.create(Migrate, [])
    await migrate.exec()

    const fresh = await ace.create(Fresh, ['--seed'])
    await fresh.exec()

    assert.equal(process.env.EXEC_SEEDER, 'true')
    delete process.env.EXEC_SEEDER
  })
})

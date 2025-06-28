import { test } from '@japa/runner'
import { AppFactory } from '@adonisjs/core/factories/app'

import {
  cleanup as cleanupTables,
  cleanupCluster as cleanupClusterTables,
  getClickHouse,
  tableExists,
  createMigrationFile,
  getMigrated,
  getClickHouseCluster,
  createClusterMigrationFile,
} from '../../test-helpers/index.js'
import * as errors from '../../src/errors.js'
import { MigrationRunner } from '../../src/migration/runner.js'

test.group('Migrator', (group) => {
  group.each.teardown(async () => {
    await cleanupTables(['adonis_schema', 'adonis_schema_versions', 'events', 'events_v2'])
  })

  test('create the schema table when there are no migrations', async ({ fs, assert, cleanup }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouse()
    cleanup(() => clickhouse.manager.closeAll())

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })

    await migrator.run()

    const hasSchemaTable = await tableExists(clickhouse, 'adonis_schema')
    assert.isTrue(hasSchemaTable)

    const [version] = await clickhouse
      .query({ query: 'SELECT * FROM adonis_schema_versions;' })
      .toJSONEachRow<{ version: number }>()
    assert.deepEqual(version, { version: 1 })

    assert.deepEqual(migrator.migratedFiles, {})
    assert.equal(migrator.status, 'skipped')
  })

  test('migrate database using schema files', async ({ fs, assert, cleanup }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouse()
    cleanup(() => clickhouse.manager.closeAll())

    const migrationName = await createMigrationFile(fs, 'events')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })

    await migrator.run()

    const migrated = await getMigrated(clickhouse)
    const hasUsersTable = await tableExists(clickhouse, 'events')
    const migratedFiles = Object.keys(migrator.migratedFiles).map((file) => {
      return { status: migrator.migratedFiles[file].status, file: file }
    })

    assert.lengthOf(migrated, 1)
    assert.equal(migrated[0].name, migrationName)
    assert.equal(migrated[0].batch, 1)
    assert.isTrue(hasUsersTable)
    assert.deepEqual(migratedFiles, [{ status: 'completed', file: migrationName }])
    assert.equal(migrator.status, 'completed')
  })

  test('do not migrate when schema up action fails', async ({ fs, assert, cleanup }) => {
    assert.plan(7)

    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouse()
    cleanup(() => clickhouse.manager.closeAll())

    const successMigration = await createMigrationFile(fs, 'events')
    const failedMigration = await createMigrationFile(fs, '<invalid_table_name>')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })

    await migrator.run()

    const migrated = await getMigrated(clickhouse)
    const hasEventsTable = await tableExists(clickhouse, 'events')
    const migratedFiles = Object.keys(migrator.migratedFiles).map((file) => {
      return { status: migrator.migratedFiles[file].status, file: file }
    })

    assert.lengthOf(migrated, 1)
    assert.equal(migrated[0].name, successMigration)
    assert.equal(migrated[0].batch, 1)
    assert.isTrue(hasEventsTable)
    assert.deepEqual(migratedFiles, [
      { status: 'completed', file: successMigration },
      { status: 'error', file: failedMigration },
    ])

    assert.equal(migrator.status, 'error')
    assert.include(migrator.error!.message, 'Syntax error')
  })

  test('do not migrate when dryRun is true', async ({ fs, assert, cleanup }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouse()
    cleanup(() => clickhouse.manager.closeAll())

    const migration1 = await createMigrationFile(fs, 'events')
    const migration2 = await createMigrationFile(fs, 'events_v2')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up', dryRun: true })

    await migrator.run()

    const migrated = await getMigrated(clickhouse)
    const hasEventsTable = await tableExists(clickhouse, 'events')
    const hasEventsV2Table = await tableExists(clickhouse, 'events_v2')
    const migratedFiles = Object.keys(migrator.migratedFiles).map((file) => {
      return { status: migrator.migratedFiles[file].status, file: file }
    })

    assert.lengthOf(migrated, 0)
    assert.isFalse(hasEventsTable)
    assert.isFalse(hasEventsV2Table)

    assert.deepEqual(migratedFiles, [
      { status: 'completed', file: migration1 },
      { status: 'completed', file: migration2 },
    ])

    assert.equal(migrator.status, 'completed')
  })

  test('do not migrate a schema file twice', async ({ fs, assert, cleanup }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouse()
    cleanup(() => clickhouse.manager.closeAll())

    const migration1 = await createMigrationFile(fs, 'events')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator.run()

    const migration2 = await createMigrationFile(fs, 'events_v2')

    const migrator1 = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator1.run()

    const migrator2 = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator2.run()

    assert.equal(migrator2.status, 'skipped')

    const migrated = await getMigrated(clickhouse)
    const hasEventsTable = await tableExists(clickhouse, 'events')
    const hasEventsV2Table = await tableExists(clickhouse, 'events_v2')

    assert.lengthOf(migrated, 2)
    assert.equal(migrated[0].name, migration1)
    assert.equal(migrated[0].batch, 1)

    assert.equal(migrated[1].name, migration2)
    assert.equal(migrated[1].batch, 2)

    assert.isTrue(hasEventsTable)
    assert.isTrue(hasEventsV2Table)
  })

  test('rollback database using schema files to a given batch', async ({ fs, assert, cleanup }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouse()
    cleanup(() => clickhouse.manager.closeAll())

    await createMigrationFile(fs, 'events')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator.run()

    const revertedMigration = await createMigrationFile(fs, 'events_v2')

    const migrator1 = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator1.run()

    const migrator2 = new MigrationRunner(clickhouse, app, { direction: 'down', batch: 1 })
    await migrator2.run()

    const migrated = await getMigrated(clickhouse)
    const hasEventsTable = await tableExists(clickhouse, 'events')
    const hasEventsV2Table = await tableExists(clickhouse, 'events_v2')
    const migratedFiles = Object.keys(migrator2.migratedFiles).map((file) => {
      return { status: migrator2.migratedFiles[file].status, file: file }
    })

    assert.lengthOf(migrated, 1)
    assert.isTrue(hasEventsTable)
    assert.isFalse(hasEventsV2Table)
    assert.deepEqual(migratedFiles, [{ status: 'completed', file: revertedMigration }])
  })

  test('rollback database to the latest batch', async ({ fs, assert, cleanup }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouse()
    cleanup(() => clickhouse.manager.closeAll())

    await createMigrationFile(fs, 'events')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator.run()

    const revertedMigration = await createMigrationFile(fs, 'events_v2')

    const migrator1 = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator1.run()

    const migrator2 = new MigrationRunner(clickhouse, app, { direction: 'down' })
    await migrator2.run()

    const migrated = await getMigrated(clickhouse)
    const hasEventsTable = await tableExists(clickhouse, 'events')
    const hasEventsV2Table = await tableExists(clickhouse, 'events_v2')
    const migratedFiles = Object.keys(migrator2.migratedFiles).map((file) => {
      return { status: migrator2.migratedFiles[file].status, file: file }
    })

    assert.lengthOf(migrated, 1)
    assert.isTrue(hasEventsTable)
    assert.isFalse(hasEventsV2Table)
    assert.deepEqual(migratedFiles, [{ status: 'completed', file: revertedMigration }])
  })

  test('rollback all down to batch 0', async ({ fs, assert, cleanup }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouse()
    cleanup(() => clickhouse.manager.closeAll())

    const migration1 = await createMigrationFile(fs, 'events')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator.run()

    const migration2 = await createMigrationFile(fs, 'events_v2')

    const migrator1 = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator1.run()

    const migrator2 = new MigrationRunner(clickhouse, app, { direction: 'down', batch: 0 })
    await migrator2.run()

    const migrated = await getMigrated(clickhouse)
    const hasEventsTable = await tableExists(clickhouse, 'events')
    const hasEventsV2Table = await tableExists(clickhouse, 'events_v2')
    const migratedFiles = Object.keys(migrator2.migratedFiles).map((file) => {
      return { status: migrator2.migratedFiles[file].status, file: file }
    })

    assert.lengthOf(migrated, 0)
    assert.isFalse(hasEventsTable)
    assert.isFalse(hasEventsV2Table)

    assert.equal(migrator2.status, 'completed')
    assert.deepEqual(migratedFiles, [
      { status: 'completed', file: migration2 },
      { status: 'completed', file: migration1 },
    ])
  })

  test('rollback database using schema files to a given step', async ({ fs, assert, cleanup }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouse()
    cleanup(() => clickhouse.manager.closeAll())

    await createMigrationFile(fs, 'events')
    const revertedMigration = await createMigrationFile(fs, 'events_v2')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator.run()

    const migrator1 = new MigrationRunner(clickhouse, app, { direction: 'down', step: 1 })
    await migrator1.run()

    const migrated = await getMigrated(clickhouse)
    const hasEventsTable = await tableExists(clickhouse, 'events')
    const hasEventsV2Table = await tableExists(clickhouse, 'events_v2')
    const migratedFiles = Object.keys(migrator1.migratedFiles).map((file) => {
      return { status: migrator1.migratedFiles[file].status, file: file }
    })

    assert.lengthOf(migrated, 1)
    assert.isTrue(hasEventsTable)
    assert.isFalse(hasEventsV2Table)
    assert.deepEqual(migratedFiles, [{ status: 'completed', file: revertedMigration }])
  })

  test('negative numbers specified by the step option must rollback all the migrated files to the current batch', async ({
    fs,
    assert,
    cleanup,
  }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouse()
    cleanup(() => clickhouse.manager.closeAll())

    await createMigrationFile(fs, 'events')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator.run()

    await createMigrationFile(fs, 'events_v2')
    await createMigrationFile(fs, 'events_v3')

    const migrator1 = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator.run()

    const migrator2 = new MigrationRunner(clickhouse, app, { direction: 'down', step: -1 })
    await migrator2.run()

    const migrated = await getMigrated(clickhouse)
    const hasEventsTable = await tableExists(clickhouse, 'events')
    const hasEventsV2Table = await tableExists(clickhouse, 'events_v2')
    const hasEventsV3Table = await tableExists(clickhouse, 'events_v3')
    const migratedFiles = Object.keys(migrator1.migratedFiles).map((file) => {
      return { status: migrator2.migratedFiles[file].status, file: file }
    })

    assert.lengthOf(migrated, 0)
    assert.isFalse(hasEventsTable)
    assert.isFalse(hasEventsV2Table)
    assert.isFalse(hasEventsV3Table)
    assert.deepEqual(migratedFiles, [])
  })

  test('rollback multiple times must be a noop', async ({ fs, assert, cleanup }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouse()
    cleanup(() => clickhouse.manager.closeAll())

    const migration1 = await createMigrationFile(fs, 'events')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator.run()

    const migration2 = await createMigrationFile(fs, 'events_v2')

    const migrator1 = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator1.run()

    const migrator2 = new MigrationRunner(clickhouse, app, { direction: 'down', batch: 0 })
    await migrator2.run()

    const migrator3 = new MigrationRunner(clickhouse, app, { direction: 'down', batch: 0 })
    await migrator3.run()

    const migrated = await getMigrated(clickhouse)
    const hasEventsTable = await tableExists(clickhouse, 'events')
    const hasEventsV2Table = await tableExists(clickhouse, 'events_v2')

    const migrator2Files = Object.keys(migrator2.migratedFiles).map((file) => {
      return { status: migrator2.migratedFiles[file].status, file: file }
    })

    const migrator3Files = Object.keys(migrator3.migratedFiles).map((file) => {
      return { status: migrator3.migratedFiles[file].status, file: file }
    })

    assert.lengthOf(migrated, 0)
    assert.isFalse(hasEventsTable)
    assert.isFalse(hasEventsV2Table)

    assert.equal(migrator2.status, 'completed')
    assert.equal(migrator3.status, 'skipped')
    assert.deepEqual(migrator2Files, [
      { status: 'completed', file: migration2 },
      { status: 'completed', file: migration1 },
    ])
    assert.deepEqual(migrator3Files, [])
  })

  test('do not rollback in dryRun', async ({ fs, assert, cleanup }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouse()
    cleanup(() => clickhouse.manager.closeAll())

    const migration1 = await createMigrationFile(fs, 'events')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator.run()

    const migration2 = await createMigrationFile(fs, 'events_v2')

    const migrator1 = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator1.run()

    const migrator2 = new MigrationRunner(clickhouse, app, {
      batch: 0,
      dryRun: true,
      direction: 'down',
    })
    await migrator2.run()

    const migrated = await getMigrated(clickhouse)
    const hasEventsTable = await tableExists(clickhouse, 'events')
    const hasEventsV2Table = await tableExists(clickhouse, 'events_v2')
    const migrator2Files = Object.keys(migrator2.migratedFiles).map((file) => {
      return { status: migrator2.migratedFiles[file].status, file: file }
    })

    assert.lengthOf(migrated, 2)
    assert.isTrue(hasEventsTable)
    assert.isTrue(hasEventsV2Table)

    assert.equal(migrator2.status, 'completed')
    assert.deepEqual(migrator2Files, [
      { status: 'completed', file: migration2 },
      { status: 'completed', file: migration1 },
    ])
  })

  test('do not rollback when a schema file goes missing', async ({ fs, assert, cleanup }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouse()
    cleanup(() => clickhouse.manager.closeAll())

    assert.plan(5)

    await createMigrationFile(fs, 'events')
    const deletedMigration = await createMigrationFile(fs, 'events_v2')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator.run()

    await fs.remove(`${deletedMigration}.ts`)

    const migrator1 = new MigrationRunner(clickhouse, app, { batch: 0, direction: 'down' })

    await migrator1.run()

    const migrated = await getMigrated(clickhouse)
    const hasEventsTable = await tableExists(clickhouse, 'events')
    const hasEventsV2Table = await tableExists(clickhouse, 'events_v2')

    assert.lengthOf(migrated, 2)
    assert.isTrue(hasEventsTable)
    assert.isTrue(hasEventsV2Table)
    assert.instanceOf(migrator1.error, errors.E_MISSING_SCHEMA_FILES)
    assert.equal(
      migrator1.error!.message,
      `Cannot perform rollback. Schema file "${deletedMigration}" is missing`
    )
  })

  test('get list of migrated files', async ({ fs, assert, cleanup }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouse()
    cleanup(() => clickhouse.manager.closeAll())

    const migration1 = await createMigrationFile(fs, 'events')
    const migration2 = await createMigrationFile(fs, 'events_v2')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator.run()
    const files = await migrator.getList()

    assert.lengthOf(files, 2)
    assert.equal(files[0].name, migration1)
    assert.equal(files[0].batch, 1)

    assert.equal(files[1].name, migration2)
    assert.equal(files[1].batch, 1)
  })

  test('skip upcoming migrations after failure', async ({ fs, assert, cleanup }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouse()
    cleanup(() => clickhouse.manager.closeAll())

    const failedMigration = await createMigrationFile(fs, '<invalid_table_name>')
    const upcomingMigration = await createMigrationFile(fs, 'events')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })

    try {
      await migrator.run()
    } catch (error) {
      assert.exists(error)
    }

    const migrated = await getMigrated(clickhouse)
    const hasEventsTable = await tableExists(clickhouse, 'events')
    const migratedFiles = Object.keys(migrator.migratedFiles).map((file) => {
      return { status: migrator.migratedFiles[file].status, file: file }
    })

    assert.lengthOf(migrated, 0)
    assert.isFalse(hasEventsTable)
    assert.deepEqual(migratedFiles, [
      { status: 'error', file: failedMigration },
      { status: 'pending', file: upcomingMigration },
    ])

    assert.equal(migrator.status, 'error')
  })

  test('use a natural sort to order files when configured', async ({ fs, assert, cleanup }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouse()
    cleanup(() => clickhouse.manager.closeAll())

    const originalConfig = Object.assign({}, clickhouse.getRawConnection('primary')!.config)

    clickhouse.getRawConnection('primary')!.config.migrations = {
      naturalSort: true,
    }

    const second = await createMigrationFile(fs, 'users', 'clickhouse/migrations/12_users')
    const first = await createMigrationFile(fs, 'accounts', 'clickhouse/migrations/1_accounts')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator.run()
    const files = await migrator.getList()

    clickhouse.getRawConnection('primary')!.config = originalConfig

    assert.lengthOf(files, 2)
    assert.equal(files[0].name, first)
    assert.equal(files[1].name, second)
  })

  test('use a natural sort to order nested files when configured', async ({
    fs,
    assert,
    cleanup,
  }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouse()
    cleanup(() => clickhouse.manager.closeAll())

    const originalConfig = Object.assign({}, clickhouse.getRawConnection('primary')!.config)

    clickhouse.getRawConnection('primary')!.config.migrations = {
      naturalSort: true,
    }

    const first = await createMigrationFile(fs, 'users', 'clickhouse/migrations/1/12_users')
    const second = await createMigrationFile(fs, 'accounts', 'clickhouse/migrations/12/1_accounts')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator.run()
    const files = await migrator.getList()

    clickhouse.getRawConnection('primary')!.config = originalConfig

    assert.lengthOf(files, 2)
    assert.equal(files[0].name, first)
    assert.equal(files[1].name, second)
  })

  test('raise exception when rollbacks in production are disabled', async ({
    fs,
    assert,
    cleanup,
  }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouse()
    cleanup(() => clickhouse.manager.closeAll())

    const originalConfig = Object.assign({}, clickhouse.getRawConnection('primary')!.config)

    clickhouse.getRawConnection('primary')!.config.migrations = {
      disableRollbacksInProduction: true,
    }

    await createMigrationFile(fs, 'events')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })
    migrator.isInProduction = true
    await migrator.run()

    await createMigrationFile(fs, 'events_v2')

    const migrator1 = new MigrationRunner(clickhouse, app, { direction: 'up' })
    migrator1.isInProduction = true
    await migrator1.run()

    const migrator2 = new MigrationRunner(clickhouse, app, { direction: 'down' })
    migrator2.isInProduction = true
    await migrator2.run()

    assert.equal(
      migrator2.error!.message,
      'Rollback in production environment is disabled. Check "config/clickhouse" file for options.'
    )

    const migrated = await getMigrated(clickhouse)
    const hasEventsTable = await tableExists(clickhouse, 'events')
    const hasEventsV2Table = await tableExists(clickhouse, 'events_v2')

    assert.lengthOf(migrated, 2)
    assert.isTrue(hasEventsTable)
    assert.isTrue(hasEventsV2Table)
    clickhouse.getRawConnection('primary')!.config = originalConfig

    delete process.env.NODE_ENV
  })
})

test.group('Migrator with cluster', (group) => {
  group.each.disableTimeout()

  group.each.teardown(async () => {
    await cleanupClusterTables(['adonis_schema', 'adonis_schema_versions', 'events', 'events_v2'])
  })

  test('create the schema table when there are no migrations', async ({ fs, assert, cleanup }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouseCluster()
    cleanup(() => clickhouse.manager.closeAll())

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })

    await migrator.run()

    for (const connection of Object.keys(clickhouse.config.connections)) {
      const hasSchemaTable = await tableExists(clickhouse, 'adonis_schema', connection)
      assert.isTrue(hasSchemaTable)

      const [version] = await clickhouse
        .connection(connection)
        .query({ query: 'SELECT * FROM adonis_schema_versions;' })
        .toJSONEachRow<{ version: number }>()
      assert.deepEqual(version, { version: 1 })

      assert.deepEqual(migrator.migratedFiles, {})
      assert.equal(migrator.status, 'skipped')
    }
  })

  test('migrate database using schema files', async ({ fs, assert, cleanup }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouseCluster()
    cleanup(() => clickhouse.manager.closeAll())

    const migrationName = await createClusterMigrationFile(fs, 'events')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })

    await migrator.run()

    const migratedFiles = Object.keys(migrator.migratedFiles).map((file) => {
      return { status: migrator.migratedFiles[file].status, file: file }
    })
    assert.deepEqual(migratedFiles, [{ status: 'completed', file: migrationName }])
    assert.equal(migrator.status, 'completed')

    for (const connection of Object.keys(clickhouse.config.connections)) {
      const migrated = await getMigrated(clickhouse, connection)
      const hasUsersTable = await tableExists(clickhouse, 'events', connection)

      assert.lengthOf(migrated, 1)
      assert.equal(migrated[0].name, migrationName)
      assert.equal(migrated[0].batch, 1)
      assert.isTrue(hasUsersTable)
    }
  })

  test('do not migrate when schema up action fails', async ({ fs, assert, cleanup }) => {
    assert.plan(11)

    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouseCluster()
    cleanup(() => clickhouse.manager.closeAll())

    const successMigration = await createClusterMigrationFile(fs, 'events')
    const failedMigration = await createClusterMigrationFile(fs, '<invalid_table_name>')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })

    await migrator.run()
    const migratedFiles = Object.keys(migrator.migratedFiles).map((file) => {
      return { status: migrator.migratedFiles[file].status, file: file }
    })
    assert.deepEqual(migratedFiles, [
      { status: 'completed', file: successMigration },
      { status: 'error', file: failedMigration },
    ])
    assert.equal(migrator.status, 'error')
    assert.include(migrator.error!.message, 'Syntax error')

    for (const connection of Object.keys(clickhouse.config.connections)) {
      const migrated = await getMigrated(clickhouse, connection)
      const hasEventsTable = await tableExists(clickhouse, 'events', connection)

      assert.lengthOf(migrated, 1)
      assert.equal(migrated[0].name, successMigration)
      assert.equal(migrated[0].batch, 1)
      assert.isTrue(hasEventsTable)
    }
  })

  test('do not migrate when dryRun is true', async ({ fs, assert, cleanup }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouseCluster()
    cleanup(() => clickhouse.manager.closeAll())

    const migration1 = await createClusterMigrationFile(fs, 'events')
    const migration2 = await createClusterMigrationFile(fs, 'events_v2')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up', dryRun: true })
    await migrator.run()

    const migratedFiles = Object.keys(migrator.migratedFiles).map((file) => {
      return { status: migrator.migratedFiles[file].status, file: file }
    })
    assert.deepEqual(migratedFiles, [
      { status: 'completed', file: migration1 },
      { status: 'completed', file: migration2 },
    ])
    assert.equal(migrator.status, 'completed')

    for (const connection of Object.keys(clickhouse.config.connections)) {
      const migrated = await getMigrated(clickhouse, connection)
      const hasEventsTable = await tableExists(clickhouse, 'events', connection)
      const hasEventsV2Table = await tableExists(clickhouse, 'events_v2', connection)

      assert.lengthOf(migrated, 0)
      assert.isFalse(hasEventsTable)
      assert.isFalse(hasEventsV2Table)
    }
  })

  test('do not migrate a schema file twice', async ({ fs, assert, cleanup }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouseCluster()
    cleanup(() => clickhouse.manager.closeAll())

    const migration1 = await createClusterMigrationFile(fs, 'events')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator.run()

    const migration2 = await createClusterMigrationFile(fs, 'events_v2')

    const migrator1 = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator1.run()

    const migrator2 = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator2.run()

    assert.equal(migrator2.status, 'skipped')

    for (const connection of Object.keys(clickhouse.config.connections)) {
      const migrated = await getMigrated(clickhouse, connection)
      const hasEventsTable = await tableExists(clickhouse, 'events', connection)
      const hasEventsV2Table = await tableExists(clickhouse, 'events_v2', connection)

      assert.lengthOf(migrated, 2)
      assert.equal(migrated[0].name, migration1)
      assert.equal(migrated[0].batch, 1)

      assert.equal(migrated[1].name, migration2)
      assert.equal(migrated[1].batch, 2)

      assert.isTrue(hasEventsTable)
      assert.isTrue(hasEventsV2Table)
    }
  })

  test('rollback database using schema files to a given batch', async ({ fs, assert, cleanup }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouseCluster()
    cleanup(() => clickhouse.manager.closeAll())

    await createClusterMigrationFile(fs, 'events')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator.run()

    const revertedMigration = await createClusterMigrationFile(fs, 'events_v2')

    const migrator1 = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator1.run()

    const migrator2 = new MigrationRunner(clickhouse, app, { direction: 'down', batch: 1 })
    await migrator2.run()

    const migratedFiles = Object.keys(migrator2.migratedFiles).map((file) => {
      return { status: migrator2.migratedFiles[file].status, file: file }
    })
    assert.deepEqual(migratedFiles, [{ status: 'completed', file: revertedMigration }])

    for (const connection of Object.keys(clickhouse.config.connections)) {
      const migrated = await getMigrated(clickhouse, connection)
      const hasEventsTable = await tableExists(clickhouse, 'events', connection)
      const hasEventsV2Table = await tableExists(clickhouse, 'events_v2', connection)
      assert.lengthOf(migrated, 1)
      assert.isTrue(hasEventsTable)
      assert.isFalse(hasEventsV2Table)
    }
  })

  test('rollback database to the latest batch', async ({ fs, assert, cleanup }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouseCluster()
    cleanup(() => clickhouse.manager.closeAll())

    await createClusterMigrationFile(fs, 'events')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator.run()

    const revertedMigration = await createClusterMigrationFile(fs, 'events_v2')

    const migrator1 = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator1.run()

    const migrator2 = new MigrationRunner(clickhouse, app, { direction: 'down' })
    await migrator2.run()

    const migratedFiles = Object.keys(migrator2.migratedFiles).map((file) => {
      return { status: migrator2.migratedFiles[file].status, file: file }
    })
    assert.deepEqual(migratedFiles, [{ status: 'completed', file: revertedMigration }])

    for (const connection of Object.keys(clickhouse.config.connections)) {
      const migrated = await getMigrated(clickhouse, connection)
      const hasEventsTable = await tableExists(clickhouse, 'events', connection)
      const hasEventsV2Table = await tableExists(clickhouse, 'events_v2', connection)
      assert.lengthOf(migrated, 1)
      assert.isTrue(hasEventsTable)
      assert.isFalse(hasEventsV2Table)
    }
  })

  test('rollback all down to batch 0', async ({ fs, assert, cleanup }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouseCluster()
    cleanup(() => clickhouse.manager.closeAll())

    const migration1 = await createClusterMigrationFile(fs, 'events')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator.run()

    const migration2 = await createClusterMigrationFile(fs, 'events_v2')

    const migrator1 = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator1.run()

    const migrator2 = new MigrationRunner(clickhouse, app, { direction: 'down', batch: 0 })
    await migrator2.run()

    const migratedFiles = Object.keys(migrator2.migratedFiles).map((file) => {
      return { status: migrator2.migratedFiles[file].status, file: file }
    })
    assert.equal(migrator2.status, 'completed')
    assert.deepEqual(migratedFiles, [
      { status: 'completed', file: migration2 },
      { status: 'completed', file: migration1 },
    ])

    for (const connection of Object.keys(clickhouse.config.connections)) {
      const migrated = await getMigrated(clickhouse, connection)
      const hasEventsTable = await tableExists(clickhouse, 'events', connection)
      const hasEventsV2Table = await tableExists(clickhouse, 'events_v2', connection)
      assert.lengthOf(migrated, 0)
      assert.isFalse(hasEventsTable)
      assert.isFalse(hasEventsV2Table)
    }
  })

  test('rollback database using schema files to a given step', async ({ fs, assert, cleanup }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouseCluster()
    cleanup(() => clickhouse.manager.closeAll())

    await createClusterMigrationFile(fs, 'events')
    const revertedMigration = await createClusterMigrationFile(fs, 'events_v2')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator.run()

    const migrator1 = new MigrationRunner(clickhouse, app, { direction: 'down', step: 1 })
    await migrator1.run()

    const hasEventsV2Table = await tableExists(clickhouse, 'events_v2')
    const migratedFiles = Object.keys(migrator1.migratedFiles).map((file) => {
      return { status: migrator1.migratedFiles[file].status, file: file }
    })
    assert.deepEqual(migratedFiles, [{ status: 'completed', file: revertedMigration }])

    for (const connection of Object.keys(clickhouse.config.connections)) {
      const migrated = await getMigrated(clickhouse, connection)
      const hasEventsTable = await tableExists(clickhouse, 'events', connection)
      assert.lengthOf(migrated, 1)
      assert.isTrue(hasEventsTable)
      assert.isFalse(hasEventsV2Table)
    }
  })

  test('negative numbers specified by the step option must rollback all the migrated files to the current batch', async ({
    fs,
    assert,
    cleanup,
  }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouseCluster()
    cleanup(() => clickhouse.manager.closeAll())

    await createClusterMigrationFile(fs, 'events')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator.run()

    await createClusterMigrationFile(fs, 'events_v2')
    await createClusterMigrationFile(fs, 'events_v3')

    const migrator1 = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator.run()

    const migrator2 = new MigrationRunner(clickhouse, app, { direction: 'down', step: -1 })
    await migrator2.run()

    const migratedFiles = Object.keys(migrator1.migratedFiles).map((file) => {
      return { status: migrator2.migratedFiles[file].status, file: file }
    })
    assert.deepEqual(migratedFiles, [])

    for (const connection of Object.keys(clickhouse.config.connections)) {
      const migrated = await getMigrated(clickhouse, connection)
      const hasEventsTable = await tableExists(clickhouse, 'events', connection)
      const hasEventsV2Table = await tableExists(clickhouse, 'events_v2', connection)
      const hasEventsV3Table = await tableExists(clickhouse, 'events_v3', connection)
      assert.lengthOf(migrated, 0)
      assert.isFalse(hasEventsTable)
      assert.isFalse(hasEventsV2Table)
      assert.isFalse(hasEventsV3Table)
    }
  })

  test('rollback multiple times must be a noop', async ({ fs, assert, cleanup }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouseCluster()
    cleanup(() => clickhouse.manager.closeAll())

    const migration1 = await createClusterMigrationFile(fs, 'events')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator.run()

    const migration2 = await createClusterMigrationFile(fs, 'events_v2')

    const migrator1 = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator1.run()

    const migrator2 = new MigrationRunner(clickhouse, app, { direction: 'down', batch: 0 })
    await migrator2.run()

    const migrator3 = new MigrationRunner(clickhouse, app, { direction: 'down', batch: 0 })
    await migrator3.run()

    const migrator2Files = Object.keys(migrator2.migratedFiles).map((file) => {
      return { status: migrator2.migratedFiles[file].status, file: file }
    })
    const migrator3Files = Object.keys(migrator3.migratedFiles).map((file) => {
      return { status: migrator3.migratedFiles[file].status, file: file }
    })
    assert.equal(migrator2.status, 'completed')
    assert.equal(migrator3.status, 'skipped')
    assert.deepEqual(migrator2Files, [
      { status: 'completed', file: migration2 },
      { status: 'completed', file: migration1 },
    ])
    assert.deepEqual(migrator3Files, [])

    for (const connection of Object.keys(clickhouse.config.connections)) {
      const migrated = await getMigrated(clickhouse, connection)
      const hasEventsTable = await tableExists(clickhouse, 'events', connection)
      const hasEventsV2Table = await tableExists(clickhouse, 'events_v2', connection)
      assert.lengthOf(migrated, 0)
      assert.isFalse(hasEventsTable)
      assert.isFalse(hasEventsV2Table)
    }
  })

  test('do not rollback in dryRun', async ({ fs, assert, cleanup }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouseCluster()
    cleanup(() => clickhouse.manager.closeAll())

    const migration1 = await createClusterMigrationFile(fs, 'events')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator.run()

    const migration2 = await createClusterMigrationFile(fs, 'events_v2')

    const migrator1 = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator1.run()

    const migrator2 = new MigrationRunner(clickhouse, app, {
      batch: 0,
      dryRun: true,
      direction: 'down',
    })
    await migrator2.run()

    const migrator2Files = Object.keys(migrator2.migratedFiles).map((file) => {
      return { status: migrator2.migratedFiles[file].status, file: file }
    })
    assert.equal(migrator2.status, 'completed')
    assert.deepEqual(migrator2Files, [
      { status: 'completed', file: migration2 },
      { status: 'completed', file: migration1 },
    ])

    for (const connection of Object.keys(clickhouse.config.connections)) {
      const migrated = await getMigrated(clickhouse, connection)
      const hasEventsTable = await tableExists(clickhouse, 'events', connection)
      const hasEventsV2Table = await tableExists(clickhouse, 'events_v2', connection)
      assert.lengthOf(migrated, 2)
      assert.isTrue(hasEventsTable)
      assert.isTrue(hasEventsV2Table)
    }
  })

  test('do not rollback when a schema file goes missing', async ({ fs, assert, cleanup }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouseCluster()
    cleanup(() => clickhouse.manager.closeAll())

    assert.plan(8)

    await createClusterMigrationFile(fs, 'events')
    const deletedMigration = await createClusterMigrationFile(fs, 'events_v2')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })
    await migrator.run()

    await fs.remove(`${deletedMigration}.ts`)

    const migrator1 = new MigrationRunner(clickhouse, app, { batch: 0, direction: 'down' })

    await migrator1.run()

    assert.instanceOf(migrator1.error, errors.E_MISSING_SCHEMA_FILES)
    assert.equal(
      migrator1.error!.message,
      `Cannot perform rollback. Schema file "${deletedMigration}" is missing`
    )

    for (const connection of Object.keys(clickhouse.config.connections)) {
      const migrated = await getMigrated(clickhouse, connection)
      const hasEventsTable = await tableExists(clickhouse, 'events', connection)
      const hasEventsV2Table = await tableExists(clickhouse, 'events_v2', connection)
      assert.lengthOf(migrated, 2)
      assert.isTrue(hasEventsTable)
      assert.isTrue(hasEventsV2Table)
    }
  })

  test('skip upcoming migrations after failure', async ({ fs, assert, cleanup }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouseCluster()
    cleanup(() => clickhouse.manager.closeAll())

    const failedMigration = await createClusterMigrationFile(fs, '<invalid_table_name>')
    const upcomingMigration = await createClusterMigrationFile(fs, 'events')

    const migrator = new MigrationRunner(clickhouse, app, { direction: 'up' })

    try {
      await migrator.run()
    } catch (error) {
      assert.exists(error)
    }

    const migratedFiles = Object.keys(migrator.migratedFiles).map((file) => {
      return { status: migrator.migratedFiles[file].status, file: file }
    })
    assert.deepEqual(migratedFiles, [
      { status: 'error', file: failedMigration },
      { status: 'pending', file: upcomingMigration },
    ])
    assert.equal(migrator.status, 'error')

    for (const connection of Object.keys(clickhouse.config.connections)) {
      const migrated = await getMigrated(clickhouse, connection)
      const hasEventsTable = await tableExists(clickhouse, 'events', connection)
      assert.lengthOf(migrated, 0)
      assert.isFalse(hasEventsTable)
    }
  })
})

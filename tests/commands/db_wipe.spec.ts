import { test } from '@japa/runner'
import { AceFactory } from '@adonisjs/core/factories'

import DbWipe from '../../commands/db_wipe.js'
import {
  setup,
  cleanup,
  getClickHouse,
  tableExists,
  getClickHouseCluster,
  setupCluster,
  cleanupCluster,
} from '../../test-helpers/index.js'

test.group('clickhouse:db:wipe and migrate:fresh', (group) => {
  group.each.setup(async () => {
    await setup()
    return () => cleanup()
  })

  test('clickhouse:db:wipe should drop all tables', async ({ fs, assert }) => {
    const clickhouse = getClickHouse()
    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    await ace.app.init()
    ace.app.container.singleton('clickhouse', () => clickhouse)
    ace.ui.switchMode('raw')

    const hasTable = await tableExists(clickhouse, 'wikistat')
    assert.isTrue(hasTable)

    const dbWipe = await ace.create(DbWipe, [])
    await dbWipe.exec()

    const hasTableAfterWip = await tableExists(clickhouse, 'wikistat')
    assert.isFalse(hasTableAfterWip)
  })
})

test.group('clickhouse:db:wipe and migrate:fresh with cluster', (group) => {
  group.each.setup(async () => {
    await setupCluster()
    return () => cleanupCluster()
  })

  test('clickhouse:db:wipe should drop all tables on every node', async ({ fs, assert }) => {
    const clickhouse = getClickHouseCluster()

    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    await ace.app.init()
    ace.app.container.singleton('clickhouse', () => clickhouse)
    ace.ui.switchMode('raw')

    for (const node of ['node01', 'node02']) {
      const hasTable = await tableExists(clickhouse, 'wikistat', node)
      assert.isTrue(hasTable)
    }

    const dbWipe = await ace.create(DbWipe, [])
    await dbWipe.exec()

    for (const node of ['node01', 'node02']) {
      const hasTableAfterWip = await tableExists(clickhouse, 'wikistat', node)
      assert.isFalse(hasTableAfterWip)
    }
  })
})

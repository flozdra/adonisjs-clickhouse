import { test } from '@japa/runner'
import { AceFactory } from '@adonisjs/core/factories'

import DbTruncate from '../../commands/db_truncate.js'
import {
  setup,
  cleanup,
  getClickHouse,
  getClickHouseCluster,
  setupCluster,
  cleanupCluster,
} from '../../test-helpers/index.js'

test.group('clickhouse:db:truncate', (group) => {
  group.each.setup(async () => {
    await setup()

    return async () => {
      await cleanup()
      await cleanup(['adonis_schema', 'adonis_schema_versions'])
    }
  })

  test('should truncate all tables', async ({ fs, assert }) => {
    const clickhouse = getClickHouse()
    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    await ace.app.init()
    ace.app.container.singleton('clickhouse', () => clickhouse)
    ace.ui.switchMode('raw')

    const now = new Date().getTime()

    await clickhouse.insert({
      table: 'wikistat',
      values: [
        { time: now, project: 'test', subproject: 'sub', path: '/', hits: 1 },
        { time: now, project: 'test', subproject: 'sub', path: '/', hits: 3 },
      ],
      format: 'JSONEachRow',
    })

    const sum = await clickhouse
      .query({ query: 'SELECT sum(hits) as total FROM wikistat' })
      .toJSONEachRow<{ total: string }>()
    assert.equal(sum[0].total, '4')

    const command = await ace.create(DbTruncate, [])
    await command.exec()

    const sumAfterTruncate = await clickhouse
      .query({ query: 'SELECT sum(hits) as total FROM wikistat' })
      .toJSONEachRow<{ total: string }>()
    assert.equal(sumAfterTruncate[0].total, '0')
  })

  test('should not truncate adonis migrations tables', async ({ fs, assert }) => {
    const clickhouse = getClickHouse()
    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    await ace.app.init()
    ace.app.container.singleton('clickhouse', () => clickhouse)
    ace.ui.switchMode('raw')

    await clickhouse.command({
      query: 'CREATE TABLE adonis_schema (id Int64, name String) ENGINE = MergeTree() ORDER BY id',
    })
    await clickhouse.command({
      query: 'CREATE TABLE adonis_schema_versions (id Int64) ENGINE = MergeTree() ORDER BY id',
    })
    await clickhouse.insert({
      table: 'adonis_schema',
      values: [{ id: 1, name: 'migration' }],
      format: 'JSONEachRow',
    })
    await clickhouse.insert({
      table: 'adonis_schema_versions',
      values: [{ id: 1 }],
      format: 'JSONEachRow',
    })

    const command = await ace.create(DbTruncate, [])
    await command.exec()

    const adonisSchemaCount = await clickhouse
      .query({ query: 'SELECT count(*) as count FROM adonis_schema' })
      .toJSONEachRow<{ count: string }>()
    const adonisSchemaVersionsCount = await clickhouse
      .query({ query: 'SELECT count(*) as count FROM adonis_schema_versions' })
      .toJSONEachRow<{ count: string }>()

    assert.equal(adonisSchemaCount[0].count, '1')
    assert.equal(adonisSchemaVersionsCount[0].count, '1')
  })
})

test.group('clickhouse:db:truncate with cluster', (group) => {
  group.each.setup(async () => {
    await setupCluster()

    return async () => {
      await cleanupCluster()
      await cleanupCluster(['adonis_schema', 'adonis_schema_versions'])
    }
  })

  test('should truncate all tables', async ({ fs, assert }) => {
    const clickhouse = getClickHouseCluster()
    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    await ace.app.init()
    ace.app.container.singleton('clickhouse', () => clickhouse)
    ace.ui.switchMode('raw')

    const now = new Date().getTime()

    await clickhouse.insert({
      table: 'wikistat',
      values: [
        { time: now, project: 'test', subproject: 'sub', path: '/', hits: 1 },
        { time: now, project: 'test', subproject: 'sub', path: '/', hits: 3 },
      ],
      format: 'JSONEachRow',
      clickhouse_settings: {
        insert_quorum: 'auto',
        insert_quorum_parallel: 0,
        select_sequential_consistency: '1',
      },
    })

    const sum01 = await clickhouse
      .query({ query: 'SELECT sum(hits) as total FROM wikistat' })
      .toJSONEachRow<{ total: string }>()
    const sum02 = await clickhouse
      .connection('node02')
      .query({ query: 'SELECT sum(hits) as total FROM wikistat' })
      .toJSONEachRow<{ total: string }>()
    assert.equal(sum01[0].total, '4')
    assert.equal(sum02[0].total, '4')

    const command = await ace.create(DbTruncate, [])
    await command.exec()

    const sumAfterTruncate01 = await clickhouse
      .query({ query: 'SELECT sum(hits) as total FROM wikistat' })
      .toJSONEachRow<{ total: string }>()
    const sumAfterTruncate02 = await clickhouse
      .connection('node02')
      .query({ query: 'SELECT sum(hits) as total FROM wikistat' })
      .toJSONEachRow<{ total: string }>()
    assert.equal(sumAfterTruncate01[0].total, '0')
    assert.equal(sumAfterTruncate02[0].total, '0')
  })

  test('should not truncate adonis migrations tables', async ({ fs, assert }) => {
    const clickhouse = getClickHouseCluster()
    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    await ace.app.init()
    ace.app.container.singleton('clickhouse', () => clickhouse)
    ace.ui.switchMode('raw')

    for (const node of ['node01', 'node02']) {
      await clickhouse.connection(node).command({
        query:
          'CREATE TABLE adonis_schema (id Int64, name String) ENGINE = MergeTree() ORDER BY id',
      })
      await clickhouse.connection(node).command({
        query: 'CREATE TABLE adonis_schema_versions (id Int64) ENGINE = MergeTree() ORDER BY id',
      })
      await clickhouse.connection(node).insert({
        table: 'adonis_schema',
        values: [{ id: 1, name: 'migration' }],
        format: 'JSONEachRow',
        clickhouse_settings: {
          insert_quorum: 'auto',
          insert_quorum_parallel: 0,
          select_sequential_consistency: '1',
        },
      })
      await clickhouse.connection(node).insert({
        table: 'adonis_schema_versions',
        values: [{ id: 1 }],
        format: 'JSONEachRow',
        clickhouse_settings: {
          insert_quorum: 'auto',
          insert_quorum_parallel: 0,
          select_sequential_consistency: '1',
        },
      })
    }

    const command = await ace.create(DbTruncate, [])
    await command.exec()

    for (const node of ['node01', 'node02']) {
      const adonisSchemaCount = await clickhouse
        .connection(node)
        .query({ query: 'SELECT count(*) as count FROM adonis_schema' })
        .toJSONEachRow<{ count: string }>()
      const adonisSchemaVersionsCount = await clickhouse
        .connection(node)
        .query({ query: 'SELECT count(*) as count FROM adonis_schema_versions' })
        .toJSONEachRow<{ count: string }>()

      assert.equal(adonisSchemaCount[0].count, '1')
      assert.equal(adonisSchemaVersionsCount[0].count, '1')
    }
  })
})

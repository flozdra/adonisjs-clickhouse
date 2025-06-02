import { join } from 'node:path'
import { test } from '@japa/runner'
import { AppFactory } from '@adonisjs/core/factories/app'

import { MigrationSource } from '../../src/migration/source.js'
import { setup, getClickHouse, cleanup } from '../../test-helpers/index.js'

test.group('MigrationSource', (group) => {
  group.each.setup(async () => {
    await setup()
  })

  group.each.teardown(async () => {
    await cleanup()
  })

  test('get list of migration files from clickhouse/migrations directory', async ({
    assert,
    fs,
  }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()

    const clickhouse = getClickHouse()
    const migrationSource = new MigrationSource(clickhouse.getRawConnection('primary')!.config, app)

    await fs.create('clickhouse/migrations/foo.js', 'module.exports = class Foo {}')
    await fs.create('clickhouse/migrations/bar.js', 'module.exports = class Bar {}')

    const directories = await migrationSource.getMigrations()

    assert.deepEqual(
      directories.map((file) => {
        return { absPath: file.absPath, name: file.name }
      }),
      [
        {
          absPath: join(fs.basePath, 'clickhouse/migrations/bar.js'),
          name: 'clickhouse/migrations/bar',
        },
        {
          absPath: join(fs.basePath, 'clickhouse/migrations/foo.js'),
          name: 'clickhouse/migrations/foo',
        },
      ]
    )
  })

  test('only collect javascript files for migration', async ({ fs, assert }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()

    const clickhouse = getClickHouse()
    const migrationSource = new MigrationSource(clickhouse.getRawConnection('primary')!.config, app)

    await fs.create('clickhouse/migrations/foo.js', 'module.exports = class Foo {}')
    await fs.create('clickhouse/migrations/foo.js.map', '{}')

    const directories = await migrationSource.getMigrations()

    assert.deepEqual(
      directories.map((file) => {
        return { absPath: file.absPath, name: file.name }
      }),
      [
        {
          absPath: join(fs.basePath, 'clickhouse/migrations/foo.js'),
          name: 'clickhouse/migrations/foo',
        },
      ]
    )
  })

  test('sort multiple migration directories seperately', async ({ fs, assert }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouse()

    const config = Object.assign({}, clickhouse.getRawConnection('primary')!.config, {
      migrations: {
        paths: ['./clickhouse/secondary', './clickhouse/primary'],
      },
    })

    const migrationSource = new MigrationSource(config, app)

    await fs.create('clickhouse/secondary/a.js', 'module.exports = class Foo {}')
    await fs.create('clickhouse/secondary/c.js', 'module.exports = class Bar {}')

    await fs.create('clickhouse/primary/b.js', 'module.exports = class Foo {}')
    await fs.create('clickhouse/primary/d.js', 'module.exports = class Bar {}')

    const files = await migrationSource.getMigrations()

    assert.deepEqual(
      files.map((file) => {
        return { absPath: file.absPath, name: file.name }
      }),
      [
        {
          absPath: join(fs.basePath, 'clickhouse/secondary/a.js'),
          name: 'clickhouse/secondary/a',
        },
        {
          absPath: join(fs.basePath, 'clickhouse/secondary/c.js'),
          name: 'clickhouse/secondary/c',
        },
        {
          absPath: join(fs.basePath, 'clickhouse/primary/b.js'),
          name: 'clickhouse/primary/b',
        },
        {
          absPath: join(fs.basePath, 'clickhouse/primary/d.js'),
          name: 'clickhouse/primary/d',
        },
      ]
    )
  })

  test('handle esm default exports properly', async ({ fs, assert }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouse()

    const migrationSource = new MigrationSource(clickhouse.getRawConnection('primary')!.config, app)

    await fs.create('clickhouse/migrations/foo.ts', 'export default class Foo {}')
    await fs.create('clickhouse/migrations/bar.ts', 'export default class Bar {}')
    await fs.create('clickhouse/migrations/baz.ts', 'export default class Baz {}')

    const directories = await migrationSource.getMigrations()

    assert.equal(((await directories[0].getSource()) as any).name, 'Bar')
    assert.equal(((await directories[1].getSource()) as any).name, 'Baz')
    assert.equal(((await directories[2].getSource()) as any).name, 'Foo')
  })
})

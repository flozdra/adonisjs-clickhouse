import { join } from 'node:path'
import { test } from '@japa/runner'
import { AppFactory } from '@adonisjs/core/factories/app'

import { SeedersSource } from '../../src/seeders/source.js'
import { getClickHouse, setup, cleanup, createSeederFile } from '../../test-helpers/index.js'

test.group('Seeds Source', (group) => {
  group.each.setup(async () => {
    await setup()
  })

  group.each.teardown(async () => {
    await cleanup()
  })

  test('get list of seed files recursively', async ({ fs, assert }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouse()

    const seedersSource = new SeedersSource(clickhouse.getRawConnection('primary')!.config, app)

    const seeder1 = await createSeederFile(fs, '', 'clickhouse/seeders/account')
    const seeder2 = await createSeederFile(fs, '', 'clickhouse/seeders/blog/post')
    const seeder3 = await createSeederFile(fs, '', 'clickhouse/seeders/tenant/user')

    await clickhouse.manager.closeAll()

    const files = await seedersSource.getSeeders()
    assert.deepEqual(
      files.map((file) => {
        return { absPath: file.absPath, name: file.name }
      }),
      [
        { absPath: join(fs.basePath, seeder1) + '.ts', name: seeder1 },
        { absPath: join(fs.basePath, seeder2) + '.ts', name: seeder2 },
        { absPath: join(fs.basePath, seeder3) + '.ts', name: seeder3 },
      ]
    )
  })

  test('only pick .ts/.js files', async ({ fs, assert }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouse()

    const seedersSource = new SeedersSource(clickhouse.getRawConnection('primary')!.config, app)

    const seeder1 = await createSeederFile(fs, '', 'clickhouse/seeders/account')
    const seeder2 = await createSeederFile(fs, '', 'clickhouse/seeders/blog/post')
    const seeder3 = await createSeederFile(fs, '', 'clickhouse/seeders/country/state')
    const seeder4 = await createSeederFile(fs, '', 'clickhouse/seeders/foo')
    await fs.create(`clickhouse/seeders/foo.bar`, '')

    await clickhouse.manager.closeAll()

    const files = await seedersSource.getSeeders()
    assert.deepEqual(
      files.map((file) => {
        return { absPath: file.absPath, name: file.name }
      }),
      [
        { absPath: join(fs.basePath, seeder1) + '.ts', name: seeder1 },
        { absPath: join(fs.basePath, seeder2) + '.ts', name: seeder2 },
        { absPath: join(fs.basePath, seeder3) + '.ts', name: seeder3 },
        { absPath: join(fs.basePath, seeder4) + '.ts', name: seeder4 },
      ]
    )
  })

  test('sort multiple seeders directories seperately', async ({ fs, assert }) => {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const clickhouse = getClickHouse()

    const config = Object.assign({}, clickhouse.getRawConnection('primary')!.config, {
      seeders: {
        paths: ['./clickhouse/secondary', './clickhouse/primary'],
      },
    })

    const seedersSource = new SeedersSource(config, app)
    const secondary1 = await createSeederFile(fs, '', 'clickhouse/secondary/blog')
    const secondary2 = await createSeederFile(fs, '', 'clickhouse/secondary/tenant/post')

    const primary1 = await createSeederFile(fs, '', 'clickhouse/primary/account')
    const primary2 = await createSeederFile(fs, '', 'clickhouse/primary/team')

    await clickhouse.manager.closeAll()

    const files = await seedersSource.getSeeders()

    assert.deepEqual(
      files.map((file) => {
        return { absPath: file.absPath, name: file.name }
      }),
      [
        { absPath: join(fs.basePath, secondary1) + '.ts', name: secondary1 },
        { absPath: join(fs.basePath, secondary2) + '.ts', name: secondary2 },
        { absPath: join(fs.basePath, primary1) + '.ts', name: primary1 },
        { absPath: join(fs.basePath, primary2) + '.ts', name: primary2 },
      ]
    )
  })
})

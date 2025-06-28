import { test } from '@japa/runner'
import { AceFactory } from '@adonisjs/core/factories'

import DbSeed from '../../commands/db_seed.js'
import { setup, cleanup, getClickHouse, createSeederFile } from '../../test-helpers/index.js'

test.group('DbSeed', (group) => {
  group.each.setup(async () => {
    await setup()

    return async () => {
      await cleanup()
      await cleanup(['adonis_schema', 'adonis_schema_versions', 'events'])
    }
  })

  test('run seeders', async ({ fs, assert }) => {
    const seederName = await createSeederFile(
      fs,
      `
        export default class {
          run() { process.env.EXEC_SEEDER = 'true' }
        }
      `
    )

    const ace = await new AceFactory().make(fs.baseUrl, {
      importer: () => {},
    })
    await ace.app.init()
    ace.app.container.singleton('clickhouse', () => getClickHouse())
    ace.ui.switchMode('raw')

    const command = await ace.create(DbSeed, [])
    await command.exec()

    command.assertLog(`green(❯) green(completed) ${seederName}`)
    assert.equal(process.env.EXEC_SEEDER, 'true')
    delete process.env.EXEC_SEEDER
  })

  test('cherry pick files using the --files flag', async ({ fs, assert }) => {
    const seeder1 = await createSeederFile(
      fs,
      `
        export default class {
          run() { process.env.EXEC_SEEDER_1 = 'true' }
        }
      `,
      'clickhouse/seeders/exec_seeder_1'
    )
    await createSeederFile(
      fs,
      `
        export default class {
          run() { process.env.EXEC_SEEDER_2 = 'true' }
        }
      `,
      'clickhouse/seeders/exec_seeder_2'
    )

    const ace = await new AceFactory().make(fs.baseUrl, {
      importer: () => {},
    })
    await ace.app.init()
    ace.app.container.singleton('clickhouse', () => getClickHouse())
    ace.ui.switchMode('raw')

    const command = await ace.create(DbSeed, ['--files', `./${seeder1}.ts`])
    await command.exec()

    assert.deepEqual(command.logger.getLogs(), [
      {
        message: `green(❯) green(completed) ${seeder1}`,
        stream: 'stdout',
      },
    ])

    assert.equal(process.env.EXEC_SEEDER_1, 'true')
    assert.isUndefined(process.env.EXEC_SEEDER_2)
    delete process.env.EXEC_SEEDER_1
  })

  test('run seeders with compact output', async ({ fs }) => {
    await createSeederFile(fs, `export default class { run() { const a = 1 } }`)
    await createSeederFile(fs, `export default class { run() { const b = 2 } }`)
    await createSeederFile(fs, `export default class { run() { const c = 3 } }`)

    const ace = await new AceFactory().make(fs.baseUrl, {
      importer: () => {},
    })
    await ace.app.init()
    ace.app.container.singleton('clickhouse', () => getClickHouse())
    ace.ui.switchMode('raw')

    const command = await ace.create(DbSeed, ['--compact-output'])
    await command.exec()

    command.assertLog('grey(❯ Executed 3 seeders)')
  })
})

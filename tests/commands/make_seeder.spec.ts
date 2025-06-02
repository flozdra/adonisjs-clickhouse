import { test } from '@japa/runner'
import { AceFactory } from '@adonisjs/core/factories'
import MakeSeeder from '../../commands/make_seeder.js'
import { getClickHouse } from '../../test-helpers/index.js'

test.group('MakeSeeder', (group) => {
  group.each.teardown(async () => {
    delete process.env.ADONIS_ACE_CWD
  })

  test('make a seeder', async ({ fs, assert }) => {
    const clickhouse = getClickHouse()
    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    ace.app.container.singleton('clickhouse', () => clickhouse)
    await ace.app.init()
    ace.ui.switchMode('raw')

    const command = await ace.create(MakeSeeder, ['event'])
    await command.exec()

    command.assertLog('green(DONE:)    create clickhouse/seeders/event_seeder.ts')
    await assert.fileContains(
      'clickhouse/seeders/event_seeder.ts',
      `import { BaseSeeder } from 'adonisjs-clickhouse/seeders'`
    )
    await assert.fileContains(
      'clickhouse/seeders/event_seeder.ts',
      `export default class extends BaseSeeder`
    )
  })
})

import { test } from '@japa/runner'
import { AceFactory } from '@adonisjs/core/factories'

import MakeMigration from '../../commands/make_migration.js'
import { setup, getClickHouse, cleanup, getConnectionConfig } from '../../test-helpers/index.js'

function fileNameFromLog(message: string) {
  return message
    .replace(/green\(DONE\:\)/, '')
    .trim()
    .replace(/^create/, '')
    .trim()
}

test.group('MakeMigration', (group) => {
  group.each.setup(async () => {
    await setup()

    return async () => {
      await cleanup()
      await cleanup(['adonis_schema', 'adonis_schema_versions', 'events'])
    }
  })

  test('create migration in the default migrations directory', async ({ fs, assert }) => {
    const clickhouse = getClickHouse()
    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    ace.app.container.singleton('clickhouse', () => clickhouse)
    await ace.app.init()
    ace.ui.switchMode('raw')

    const command = await ace.create(MakeMigration, ['create_events_table'])
    await command.exec()
    const filename = fileNameFromLog(command.logger.getLogs()[0].message)

    command.assertLogMatches(/clickhouse\/migrations\/\d+_create_events_table/)
    await assert.fileContains(filename, `import { BaseSchema } from 'adonisjs-clickhouse/schema'`)
    await assert.fileContains(filename, `export default class implements BaseSchema {`)
  })

  test('create migration file inside a sub-folder', async ({ fs, assert }) => {
    const clickhouse = getClickHouse()
    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    ace.app.container.singleton('clickhouse', () => clickhouse)
    await ace.app.init()
    ace.ui.switchMode('raw')

    const command = await ace.create(MakeMigration, ['users/create_events_table'])
    await command.exec()
    const filename = fileNameFromLog(command.logger.getLogs()[0].message)

    command.assertLogMatches(/clickhouse\/migrations\/users\/\d+_create_events_table/)
    await assert.fileContains(filename, `import { BaseSchema } from 'adonisjs-clickhouse/schema'`)
    await assert.fileContains(filename, `export default class implements BaseSchema {`)
  })

  test('print error when using an invalid db connection', async ({ fs }) => {
    const clickhouse = getClickHouse()
    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    ace.app.container.singleton('clickhouse', () => clickhouse)
    await ace.app.init()
    ace.ui.switchMode('raw')

    const command = await ace.create(MakeMigration, ['create_events_table', '--connection', 'foo'])
    await command.exec()

    command.assertFailed()
    command.assertLog(
      '[ red(error) ] "foo" is not a valid connection name. Double check "config/clickhouse" file',
      'stderr'
    )
  })

  test('pick directory from migration sources').run(async ({ fs }) => {
    const clickhouse = getClickHouse(undefined, {
      connection: 'primary',
      connections: {
        primary: Object.assign(getConnectionConfig(), {
          migrations: {
            paths: ['clickhouse/foo', './clickhouse/bar'],
          },
        }),
      },
    })

    const ace = await new AceFactory().make(fs.baseUrl, { importer: () => {} })
    ace.app.container.singleton('clickhouse', () => clickhouse)
    await ace.app.init()
    ace.ui.switchMode('raw')

    const command = await ace.create(MakeMigration, ['create_events_table'])
    command.prompt.trap('Select the migrations folder').chooseOption(0)

    await command.exec()
    command.assertLogMatches(/clickhouse\/foo\/\d+_create_events_table/)
  })
})

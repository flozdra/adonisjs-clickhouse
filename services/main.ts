import app from '@adonisjs/core/services/app'
import { ClickHouse } from '../src/clickhouse/main.js'

let clickhouse: ClickHouse

await app.booted(async () => {
  clickhouse = await app.container.make('clickhouse')
})

export { clickhouse as default }

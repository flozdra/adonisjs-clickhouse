# ClickHouse wrapper for AdonisJS

This package provides a ClickHouse database wrapper for AdonisJS applications.
This includes a ClickHouse client, with supports for migrations, seeders, and test utilities.

> ⚠️ **Caution** : This package does not support `CLUSTER` mode for the **migrations** since the `adonis_schema` table is created with the `MergeTree` engine (not `ReplicatedMergeTree`).
>
> You can however use this package to query a ClickHouse cluster by specifying the `ON CLUSTER` clause in your queries.

## Installation

Install the package using npm:

```bash
npm install adonisjs-clickhouse
```

Then, you can configure the package by running the following command:

```bash
node ace configure adonisjs-clickhouse
```

This command will :

- Create a configuration file at `config/clickhouse.ts`
- Register the commands and the provider in the `adonisrc.ts` file
- Add the required environment variables to your `.env` file
- Set up validation rules for environment variables in the `env.ts` file

## Configuration

The configuration file is located at `config/clickhouse.ts`. You can customize the ClickHouse connection settings here.
You can also define multiple connections in the `connections` object.

```typescript
import env from '#start/env'
import { defineConfig } from 'adonisjs-clickhouse'

const clickhouseConfig = defineConfig({
  connection: 'primary',

  connections: {
    primary: {
      /**
       * ClickHouse JS client configuration
       */
      application: 'AdonisJS',
      url: env.get('CLICKHOUSE_URL'),
      username: env.get('CLICKHOUSE_USER'),
      password: env.get('CLICKHOUSE_PASSWORD', ''),
      database: env.get('CLICKHOUSE_DB'),
      clickhouse_settings: {},
      compression: { request: false, response: true },
      request_timeout: 30e3,

      /**
       * Debug mode for the connection
       */
      debug: false,

      /**
       * Migrations configuration
       */
      migrations: {
        paths: ['clickhouse/migrations'],
        disableRollbacksInProduction: true,
        naturalSort: true,
      },

      /**
       * Seeders configuration
       */
      seeders: {
        paths: ['clickhouse/seeders'],
      },
    },
  },
})

export default clickhouseConfig
```

For more information about the ClickHouse JS client configuration, please refer to the [official documentation](https://clickhouse.com/docs/en/integrations/language-clients/javascript#configuration).

## Usage

Once installed and configured, you can use the ClickHouse client by importing the service in your application:

```typescript
import clickhouse from 'adonisjs-clickhouse/services/main'

const response = await clickhouse.query({ query: 'SELECT * FROM my_table' })

// Using a specific connection:
const response = await clickhouse.connection('secondary').query({ query: 'SELECT * FROM my_table' })
```

The API remains similar to the official ClickHouse client. The service exposes the following methods from the ClickHouse client:

- [`query`](https://clickhouse.com/docs/integrations/javascript#query-method)
- [`insert`](https://clickhouse.com/docs/integrations/javascript#insert-method)
- [`command`](https://clickhouse.com/docs/integrations/javascript#command-method)
- [`exec`](https://clickhouse.com/docs/integrations/javascript#exec-method)
- [`ping`](https://clickhouse.com/docs/integrations/javascript#ping-method)

The package also add a custom query method `toJSONEachRow`, which is a shorthand for specifying the format to `JSONEachRow`, and convert the response using the `json` method:

```typescript
// Using the query method with JSONEachRow format
const result = await clickhouse.query({ query: 'SELECT * FROM my_table', format: 'JSONEachRow' })
const rows = result.json<{ id: number }>()

// Using the shorthand method
const rows = await clickhouse
  .query({ query: 'SELECT * FROM my_table' })
  .toJSONEachRow<{ id: number }>()
```

## Migrations

You can use this package to migrate your ClickHouse database schema. The API is similar to the [`@adonisjs/lucid` migration tool](https://lucid.adonisjs.com/docs/migrations).

> ⚠️ **Caution**: The migrations are not runned under a transaction since this is an experimental feature in ClickHouse.
>
> Moreover, this package does not support `CLUSTER` mode for the migrations: the `adonis_schema` table is created with the `MergeTree` engine (not `ReplicatedMergeTree`).

The configuration for migrations is defined in the `config/clickhouse.ts` file under the `migrations` property of the connection:

```typescript
{
  migrations: {
    /**
     * Path to the migrations directory
     * @default ['clickhouse/migrations']
     */
    paths?: string[]
    /**
     * Name of the table to store the migrations
     * @default 'adonis_schema'
     */
    tableName?: string
    /**
     * Prevent rollbacks in production
     * @default false
     */
    disableRollbacksInProduction?: boolean
    /**
     * Use natural sort for migration files
     */
    naturalSort?: boolean
  }
}
```

You can create a new migration using the following command:

```bash
node ace clickhouse:make:migration create_events_table
```

Then, you can specify the `up` and `down` methods in the migration file located in the `clickhouse/migrations` directory. You can use the `command` method to create your table, but feel free to use any other methods exposed by the client.

```typescript
import { BaseSchema } from 'adonisjs-clickhouse/schema'

export default class extends BaseSchema {
  async up() {
    await this.client.command({
      query: `
        CREATE TABLE events 
        (name LowCardinality(String), time DateTime) 
        ENGINE = MergeTree
        ORDER BY (name, time);
      `,
    })
  }
  async down() {
    await this.client.command({ query: 'DROP TABLE events;' })
  }
}
```

Finally, you can run the migrations using the following command:

```bash
node ace clickhouse:migration:run
```

There are other commands available for migrations:

```bash
# Dry run mode
node ace clickhouse:migration:run --dry-run

# Rollback the last migration
node ace clickhouse:migration:rollback

# Rollback using a specific batch
node ace clickhouse:migration:rollback --batch 1

# Specify a connection
node ace clickhouse:migration:run --connection secondary
```

## Seeders

You can also use this package to create seeders for your ClickHouse database. The API is similar to the [`@adonisjs/lucid` seeder tool](https://lucid.adonisjs.com/docs/seeders).

The configuration for migrations is defined in the `config/clickhouse.ts` file under the `seeders` property:

```typescript
{
  seeders: {
    /**
     * Path to the seeders directory
     * @default ['clickhouse/seeders']
     */
    paths?: string[]
    /**
     * Use natural sort for seeder files
     */
    naturalSort?: boolean
  }
}
```

You can create a new seeder using the following command:

```bash
node ace clickhouse:make:seeder events
```

Then, you can specify the `run` method in the seeder file located in the `clickhouse/seeders` directory. You can use the `insert` method to insert data into your table, but feel free to use any other methods exposed by the client.

You can also specify the environment by seeder using the `environment` property.

```typescript
import { BaseSeeder } from 'adonisjs-clickhouse/seeders'

export default class extends BaseSeeder {
  static environment = ['development', 'testing']

  async run() {
    // Write your queries inside the run method
    await this.client.insert({
      table: 'events',
      values: [{ name: 'click', time: new Date().getTime() }],
      columns: ['name', 'time'],
      format: 'JSONEachRow',
    })
  }
}
```

Finally, you can run the seeders using the following command:

```bash
# Run all seeders
node ace db:seed

# Run a specific seeder
node ace db:seed --files "./clickhouse/seeders/events.ts"

# Run in interactive mode
node ace db:seed -i

# Specify a connection
node ace db:seed --connection secondary
```

## Testing

This package also provides a test utility class in the same way the `@adonisjs/lucid` package does. See the [AdonisJS documentation](https://docs.adonisjs.com/guides/testing/database) for more information.

A `clickhouse` macro is registered on the `testUtils` instance, which allows you to interact with the database before and after your tests.
The macro provides the following methods:

- `migrate`: Run the migrations before the tests, and roll them back after the tests.
- `truncate`: Truncate all the tables before the tests.
- `seed`: Run the seeders before the tests.

For example, you can migrate the ClickHouse database before each run cycle by adding the following hook to your `tests/bootstrap.ts` file:

```typescript
import testUtils from '@adonisjs/core/services/test_utils'

export const runnerHooks: Required<Pick<Config, 'setup' | 'teardown'>> = {
  setup: [() => testUtils.clickhouse().migrate()],
  teardown: [],
}
```

You can also use the `clickhouse` macro in your tests file. For example, you can truncate all the tables before each test:

```typescript
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'

test.group('Events', (group) => {
  group.each.setup(() => testUtils.clickhouse().truncate())
})
```

## License

This project is licensed under the MIT License.

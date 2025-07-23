# ClickHouse wrapper for AdonisJS

[![github-actions-image]][github-actions-url] [![npm-image]][npm-url] [![license-image]][license-url] [![typescript-image]][typescript-url]

This package provides a ClickHouse database wrapper for AdonisJS applications.
This includes a ClickHouse client, with supports for migrations, seeders, and test utilities.

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
       * Cluster name for the package commands when using a ClickHouse cluster.
       */
      clusterName: env.get('CLICKHOUSE_CLUSTER_NAME'),

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

        /**
         * ReplicatedMergeTree options for the migration tables when using a ClickHouse cluster.
         */
        replicatedMergeTree: {
          zooKeeperPath: '/clickhouse/tables/{shard}/{database}/{table}',
          replicaName: '{replica}',
        },
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

    /**
     * ReplicatedMergeTree options for the migration tables.
     */
    replicatedMergeTree?: { zooKeeperPath: string; replicaName: string } | true
  }
}
```

### Note on running migrations in a ClickHouse cluster

If you are using a ClickHouse cluster (with multiple replicas and/or shards), you can use the `clusterName` and `replicatedMergeTree` options so that the migration tables (`adonis_schema` and `adonis_schema_versions`) are using the `ReplicatedMergeTree` engine. This is useful to ensure that the migration tables are replicated and synchronized across all nodes in the cluster.

> ⚠️ **Caution**: The migrations will only be executed on the node where the command is run.
> If you want to make a migration to create a table across all your replicas, you must include the `ON CLUSTER` clause and the `ReplicatedMergeTree` engine in your command (see the examples in the [Migration usage](#migration-usage) section below).
>
> Please read the [official documentation](https://clickhouse.com/docs/engines/table-engines/mergetree-family/replication) for more information about the Data replication in ClickHouse.

#### ClickHouse Cloud

If you are using ClickHouse Cloud, the replication is managed for you, so you don't need to specify the `ReplicatedMergeTree` engine parameters.

In that case, you can simply set the `clusterName` and the `migrations.replicatedMergeTree` options to `true` in the configuration file:

```typescript
{
  clusterName: 'cluster_1S_2R',
  migrations: {
    replicatedMergeTree: true,
  },
}
```

The migration tables will be created as follow:

```sql
CREATE TABLE <adonis_schema_tables> ON CLUSTER cluster_1S_2R (
  ...
) ENGINE = ReplicatedMergeTree
```

#### Self-hosted ClickHouse cluster

In the case you have a self-hosted ClickHouse cluster, you have two options:

- set the `clusterName` option and the `migrations.replicatedMergeTree` option to an object with the `zooKeeperPath` and `replicaName` properties

```typescript
{
  clusterName: 'cluster_1S_2R',
  migrations: {
    replicatedMergeTree: {
      zooKeeperPath: '/clickhouse/tables/{shard}/{database}/{table}',
      replicaName: '{replica}',
    },
  },
}
```

The migration tables will be created as follow:

```sql
CREATE TABLE <adonis_schema_tables> ON CLUSTER cluster_1S_2R (
  ...
) ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/{database}/{table}', '{replica}')
```

- or set the `clusterName` option and the `migrations.replicatedMergeTree` option to `true` to use the default values from the ClickHouse server configuration (`<default_replica_path>` and `<default_replica_name>`).

```typescript
{
  clusterName: 'cluster_1S_2R',
  migrations: {
    replicatedMergeTree: true
  }
}
```

The migration tables will be created as follow:

```sql
CREATE TABLE <adonis_schema_tables> ON CLUSTER cluster_1S_2R (
  ...
) ENGINE = ReplicatedMergeTree
```

The ClickHouse server will automatically use the `default_replica_path` and `default_replica_name` from the server configuration:

```xml
<default_replica_path>/clickhouse/tables/{shard}/{database}/{table}</default_replica_path>
<default_replica_name>{replica}</default_replica_name>
```

### Migration usage

You can create a new migration using the following command:

```bash
node ace make:clickhouse:migration create_events_table
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

If you are using a ClickHouse cluster, you mostly want include the `ON CLUSTER` clause and use a `Replicated` engine in your command to ensure that the table is replicated and synchronized across all nodes in the cluster:

```typescript
import { BaseSchema } from 'adonisjs-clickhouse/schema'

export default class extends BaseSchema {
  async up() {
    await this.client.command({
      query: `
        CREATE TABLE events ON CLUSTER cluster_1S_2R
        (name LowCardinality(String), time DateTime) 
        ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/{database}/{table}', '{replica}')
        ORDER BY (name, time);
      `,
    })
  }
  async down() {
    await this.client.command({ query: 'DROP TABLE events ON CLUSTER cluster_1S_2R;' })
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

## Truncate and wipe commands

The package also provides two commands to truncate or wipe the ClickHouse database:

```bash
node ace clickhouse:db:truncate
```

The truncate command will list all the tables using the `system.tables` table, and truncate them one by one, **except the migration tables**.

```bash
node ace clickhouse:db:wipe
```

The wipe command will drop all the tables in the database **including the migration tables**.

> ⚠️ **If you are using a ClickHouse cluster, set the `clusterName` option in the configuration so that these commands will run the queries using the `ON CLUSTER` clause.**

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
node ace make:clickhouse:seeder events
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

- `migrate`: Run the migrations and returns a function to roll them back.
- `truncate`: Returns a function to truncate all the tables.
- `seed`: Run the seeders.

For example, you can migrate the ClickHouse database before each run cycle by adding the following hook to your `tests/bootstrap.ts` file:

```typescript
import testUtils from '@adonisjs/core/services/test_utils'

export const runnerHooks: Required<Pick<Config, 'setup' | 'teardown'>> = {
  setup: [() => testUtils.clickhouse().migrate()],
  teardown: [],
}
```

You can also use the `clickhouse` macro in your tests file. For example, you can truncate all the tables after each test:

```typescript
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'

test.group('Events', (group) => {
  group.each.setup(() => testUtils.clickhouse().truncate())
})
```

## License

This project is licensed under the MIT License.

[github-actions-image]: https://img.shields.io/github/actions/workflow/status/flozdra/adonisjs-clickhouse/test.yml
[github-actions-url]: https://github.com/flozdra/adonisjs-clickhouse/actions/workflows/test.yml 'github-actions'
[npm-image]: https://img.shields.io/npm/v/adonisjs-clickhouse.svg?logo=npm
[npm-url]: https://npmjs.org/package/adonisjs-clickhouse 'npm'
[license-image]: https://img.shields.io/npm/l/adonisjs-clickhouse?color=blueviolet
[license-url]: LICENSE.md 'license'
[typescript-image]: https://img.shields.io/badge/Typescript-294E80.svg?logo=typescript
[typescript-url]: "typescript"

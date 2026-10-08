import { test } from '@japa/runner'

import { defineConfig } from '../src/define_config.js'
import type { ClickHouseConfig, ConnectionNameOf, InferConnections } from '../src/types/index.js'

test.group('Types | connection names', () => {
  test('infer connection names from the config', ({ expectTypeOf }) => {
    const config = defineConfig({
      connection: 'primary',
      connections: { primary: {}, secondary: {} },
    })

    expectTypeOf<ConnectionNameOf<InferConnections<typeof config>>>().toEqualTypeOf<
      'primary' | 'secondary'
    >()
  })

  test('fallback to string when no connections are known', ({ expectTypeOf }) => {
    expectTypeOf<ConnectionNameOf<{}>>().toEqualTypeOf<string>()
  })

  test('restrict the default connection to the defined connections', ({ expectTypeOf }) => {
    expectTypeOf<ClickHouseConfig<{ primary: {} }>['connection']>().toEqualTypeOf<'primary'>()
    expectTypeOf<ClickHouseConfig<{ primary: {} }>['connection']>().not.toEqualTypeOf<string>()

    /**
     * `.not.toBeCallableWith` is not supported by expect-type,
     * so the invalid call is checked with `@ts-expect-error`
     */
    defineConfig({
      // @ts-expect-error unknown connection
      connection: 'unknown',
      connections: { primary: {} },
    })
  })
})

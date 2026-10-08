import type { ClickHouseConfig, ConnectionsList } from './types/index.js'

export function defineConfig<Connections extends ConnectionsList>(
  config: ClickHouseConfig<Connections>
): ClickHouseConfig<Connections> {
  return config
}

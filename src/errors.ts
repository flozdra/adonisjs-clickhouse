import { createError } from '@poppinss/utils'

export const E_UNMANAGED_DB_CONNECTION = createError<[string]>(
  'Cannot connect to unregistered connection %s',
  'E_UNMANAGED_DB_CONNECTION',
  500
)

export const E_MISSING_SCHEMA_FILES = createError(
  'Cannot perform rollback. Schema file "%s" is missing',
  'E_MISSING_SCHEMA_FILES',
  500
)

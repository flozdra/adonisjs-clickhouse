// @ts-expect-error
import igniculus from 'igniculus'
import kleur from 'kleur'
import { inspect } from 'node:util'
import hrTime from 'pretty-hrtime'
import type {
  QueryEvent,
  CommandEvent,
  ExecEvent,
  InsertEvent,
  PingEvent,
} from '../types/method.js'

const illuminate = igniculus({
  comments: { fg: 'gray' },
  constants: { fg: 'red' },
  delimitedIdentifiers: { fg: 'yellow' },
  variables: { fg: 'cyan' },
  dataTypes: { fg: 'green', casing: 'uppercase' },
  standardKeywords: { fg: 'green', casing: 'uppercase' },
  lesserKeywords: { mode: 'bold', fg: 'cyan', casing: 'uppercase' },
  prefix: { replace: /.*?: / },
  output: (line: string) => line,
})

/**
 * Colorizes the sql query
 */
function colorizeQuery(sql: string) {
  return illuminate(sql)
}

/**
 * Pretty print queries
 */
export function prettyPrintQuery(queryEvent: QueryEvent) {
  let output = kleur.gray(`[query] "${queryEvent.connection}" `)

  /**
   * Concatenate the duration
   */
  if (queryEvent.duration) {
    output += `(${hrTime(queryEvent.duration)}) `
  }

  /**
   * Colorize query and bindings
   */
  output += colorizeQuery(queryEvent.query)
  if (queryEvent.bindings) {
    output += kleur.gray(` ${inspect(queryEvent.bindings)}`)
  }

  /**
   * Print it to the console
   */
  console.log(output)
}

/**
 * Pretty print commands
 */
export function prettyPrintCommand(commandEvent: CommandEvent) {
  let output: string = kleur.gray(`[command] "${commandEvent.connection}" `)

  /**
   * Concatenate the duration
   */
  if (commandEvent.duration) {
    output += `(${hrTime(commandEvent.duration)}) `
  }

  /**
   * Colorize query
   */
  output += colorizeQuery(commandEvent.query)

  /**
   * Print it to the console
   */
  console.log(output)
}

/**
 * Pretty print execs
 */
export function prettyPrintExec(execEvent: ExecEvent) {
  let output: string = kleur.gray(`[exec] "${execEvent.connection}" `)

  /**
   * Concatenate the duration
   */
  if (execEvent.duration) {
    output += `(${hrTime(execEvent.duration)}) `
  }

  /**
   * Colorize query and bindings
   */
  output += colorizeQuery(execEvent.query)

  /**
   * Print it to the console
   */
  console.log(output)
}

/**
 * Pretty print inserts
 */
export function prettyPrintInsert(insertEvent: InsertEvent) {
  let output: string = kleur.gray(`[insert] "${insertEvent.connection}" `)

  /**
   * Concatenate the model
   */
  output += `${insertEvent.table} `

  /**
   * Concatenate the duration
   */
  if (insertEvent.duration) {
    output += `(${hrTime(insertEvent.duration)}) `
  }

  /**
   * Print it to the console
   */
  console.log(output)
}

/**
 * Pretty print ping
 */
export function prettyPrintPing(pingEvent: PingEvent) {
  let output = kleur.gray(`[ping] "${pingEvent.connection}" `)

  /**
   * Concatenate the duration
   */
  if (pingEvent.duration) {
    output += `(${hrTime(pingEvent.duration)}) `
  }

  /**
   * Print it to the console
   */
  console.log(output)
}

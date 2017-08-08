/* @flow */

import type {Operation, DataDefinition} from './operation.js'
import type {Options} from './options.js'
import type {
  SecuritySchemeObject,
  SchemaObject
} from './oas3.js'

export type ProcessedSecurityScheme = {
  rawName: string,
  def: SecuritySchemeObject,
  parameters: {[string]: string},
  schema: SchemaObject
}

export type PreprocessingData = {
  /**
   * List of Operation objects
   */
  operations: {[string] : Operation},

  /**
   * List of all the used object names to avoid collision
   */
  usedOTNames: string[],

  /**
   * List of data definitions for JSON schemas already used.
   */
  defs: DataDefinition[],

  /**
   * The security definitions contained in the OAS. References are resolved.
   *
   * NOTE: Does not contain OAuth 2.0-related security schemes
   */
  security: {[string]: ProcessedSecurityScheme},

  /**
   * Mapping between beautified strings and their original ones
   */
  saneMap: {[string] : string},

  /**
   * Options passed to OASGraph by the user
   */
  options: Options
}

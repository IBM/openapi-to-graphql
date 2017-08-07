/* @flow */

import type {Operation} from './operation.js'
import type {Options} from './options.js'
import type {SecuritySchemeObject} from './oas3.js'

export type PreprocessingData = {
  /**
   * List of Operation objects
   */
  operations: Operation[],

  /**
   * List of all the used object names to avoid collision
   */
  usedOTNames: string[],

  /**
   * The security definitions contained in the OAS. References are resolved.
   *
   * NOTE: Does not contain OAuth 2.0-related security schemes
   */
  security: {[string]: SecuritySchemeObject}[],

  /**
   * Mapping between beautified strings and their original ones
   */
  saneMap: {[string] : string},

  /**
   * Options passed to OASGraph by the user
   */
  options: Options
}

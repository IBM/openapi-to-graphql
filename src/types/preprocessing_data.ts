// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: oasgraph
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

/**
 * Type definitions for the data created during preprocessing.
 */

import { Operation, DataDefinition } from './operation'
import { Options } from './options'
import { SecuritySchemeObject, SchemaObject } from './oas3'

export type ProcessedSecurityScheme = {
  rawName: string,
  def: SecuritySchemeObject,

  /**
   * Stores the names of the authentication credentials
   * NOTE: Structure depends on the type of the protocol (basic, API key...)
   * NOTE: Mainly used for the AnyAuth viewers
   */
  parameters: {[key: string]: string},

  /**
   * JSON schema to create the viewer for this security scheme from.
   */
  schema: SchemaObject
}

export type PreprocessingData = {
  /**
   * List of Operation objects
   */
  operations: {[key: string]: Operation},

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
   * NOTE: Keys are beautified
   * NOTE: Does not contain OAuth 2.0-related security schemes
   */
  security: {[key: string]: ProcessedSecurityScheme},

  /**
   * Mapping between beautified strings and their original ones
   */
  saneMap: {[key: string]: string},

  /**
   * Options passed to OASGraph by the user
   */
  options: Options
}

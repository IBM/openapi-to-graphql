/* @flow */

import type {
  LinkObject,
  ParameterObject,
  SecuritySchemeObject,
  ServerObject
} from './oas3.js'

type RequestDataDefinition = {

}

type ResponseDataDefinition = {

}

export type Operation = {
  /**
   * Identifier of the operation - may be created by concatenating method & path
   */
  operationId: string,

  /**
   * Human-readable description of the operation
   */
  description: string,

  /**
   * URL path of this operation
   */
  path: string,

  /**
   * HTTP method for this operation
   */
  method: string,

  /**
   * Information about the request payload
   */
  reqDef: RequestDataDefinition,

  /**
   * Determines wheter request payload is required for the request
   */
  reqRequired: boolean,

  /**
   * Information about the response payload
   */
  resDef: ResponseDataDefinition,

  /**
   * Links of the operation
   */
  links: {
    [string]: LinkObject
  },

  /**
   * List of parameters of the operation
   */
  parameters: ParameterObject[],

  /**
   * Security protocols for this operation, except OAuth 2
   */
  securitySchemes: SecuritySchemeObject[],

  /**
   * (Local) server definitions of the operation.
   */
  servers: ServerObject[]
}

/* @flow */

import type {
  LinkObject,
  ParameterObject,
  ServerObject,
  SchemaObject
} from './oas3.js'

import type {
  GraphQLScalarType,
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLList
} from 'graphql'

export type DataDefinition = {
  schema: SchemaObject,
  otName: string,
  iotName: string,
  ot?: GraphQLObjectType | GraphQLScalarType | GraphQLList<any>,
  iot?: GraphQLInputObjectType | GraphQLList<any>
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
   * Information about the request payload (if any)
   */
  reqDef: ?DataDefinition,

  /**
   * Determines wheter request payload is required for the request
   */
  reqRequired: boolean,

  /**
   * Information about the response payload
   */
  resDef: DataDefinition,

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
   * Security requirements for this operation, except OAuth 2
   */
  securityRequirements: string[],

  /**
   * (Local) server definitions of the operation.
   */
  servers: ServerObject[],

  /**
   * List of operations which are nested based on their path.
   */
  subOps?: Operation[]
}

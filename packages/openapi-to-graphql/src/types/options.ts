// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

// Type imports:
import * as NodeRequest from 'request'
import { ResolveFunction } from './graphql'

/**
 * Type definition of the options that users can pass to OpenAPI-to-GraphQL.
 */
export type Warning = {
  type: string
  message: string
  mitigation: string
}

export type Report = {
  warnings: Warning[]
  numOps: number
  numOpsQuery: number
  numOpsMutation: number
  numQueriesCreated: number
  numMutationsCreated: number
}

export type Options = {
  /**
   * Adhere to the OAS as closely as possible. If set to true, any deviation
   * from the OAS will lead OpenAPI-to-GraphQL to throw.
   */
  strict?: boolean

  /**
   * Custom headers to send with every request made by a resolve function.
   */
  headers?: { [key: string]: string }

  /**
   * Custom query parameters to send with every reqeust by a resolve function.
   */
  qs?: { [key: string]: string }

  /**
   * Determines whether OpenAPI-to-GraphQL should create viewers that allow users to pass
   * basic auth and API key credentials.
   */
  viewer?: boolean

  /**
   * JSON path to OAuth 2 token contained in GraphQL context. Tokens will per
   * default be sent in "Authorization" header.
   */
  tokenJSONpath?: string

  /**
   * Determines whether to send OAuth 2 token as query parameter instead of in
   * header.
   */
  sendOAuthTokenInQuery?: boolean

  /**
   * Under certain circumstances (such as response code 204), some RESTful
   * operations should not return any data. However, GraphQL objects must have
   * a data structure. Normally, these operations would be ignored but for the
   * sake of completeness, the following option will give these operations a
   * placeholder data structure. Even though the data structure will not have
   * any practical use, at least the operations will show up in the schema.
   */
  fillEmptyResponses?: boolean

  /**
   * Specifies the URL on which all paths will be based on.
   * Overrides the server object in the OAS.
   */
  baseUrl?: string

  /**
   * Field names can only be beautified operationIds
   *
   * By default, query field names are based on the return type type name and
   * mutation field names are based on the operationId, which may be generated
   * if it does not exist.
   *
   * This option forces OpenAPI-to-GraphQL to only create field names based on the
   * operationId.
   */
  operationIdFieldNames?: boolean

  /**
   * Allows to override or add options to the node's request object used to make
   * calls to the API backend.
   * e.g. Setup the web proxy to use.
   */
  requestOptions?: NodeRequest.OptionsWithUrl

  /**
   * The error extensions is part of the GraphQLErrors that will be returned if
   * the query cannot be fulfilled. It provides information about the failed
   * REST call(e.g. the method, path, status code, response
   * headers, and response body). It can be useful for debugging but may
   * unintentionally leak information.
   *
   * This option prevents the extensions from being created.
   */
  provideErrorExtensions?: boolean

  /**
   * Allows to define custom resolvers for fields on the query/mutation root
   * operation type.
   *
   * In other words, instead of resolving on an operation (REST call) defined in
   * the OAS, the field will resolve on the custom resolver. Note that this will
   * also affect the behavior of links.
   *
   * The field is identifed first by the title of the OAS, then the path of the
   * operation, and lastly the method of the operation.
   *
   * Use cases include the resolution of complex relationships between types,
   * implementing performance improvements like caching, or dealing with
   * non-standard authentication requirements.
   */
  customResolvers?: {
    [title: string]: { [path: string]: { [method: string]: ResolveFunction } }
  }

  /**
   * Auto-generate a 'limit' argument for all fields that return lists of
   * objects, including ones produced by links
   *
   * Allows to constrain the return size of lists of objects
   *
   * Returns the first n number of elements in the list
   */
  addLimitArgument?: boolean
}

export type InternalOptions = {
  /**
   * Adhere to the OAS as closely as possible. If set to true, any deviation
   * from the OAS will lead OpenAPI-to-GraphQL to throw.
   */
  strict: boolean

  /**
   * Custom headers to send with every request made by a resolve function.
   */
  headers?: { [key: string]: string }

  /**
   * Custom query parameters to send with every reqeust by a resolve function.
   */
  qs?: { [key: string]: string }

  /**
   * Determines whether OpenAPI-to-GraphQL should create viewers that allow users to pass
   * basic auth and API key credentials.
   */
  viewer: boolean

  /**
   * JSON path to OAuth 2 token contained in GraphQL context. Tokens will per
   * default be sent in "Authorization" header.
   */
  tokenJSONpath?: string

  /**
   * Determines whether to send OAuth 2 token as query parameter instead of in
   * header.
   */
  sendOAuthTokenInQuery: boolean

  /**
   * Holds information about the GraphQL schema generation process
   */
  report: Report

  /**
   * Under certain circumstances (such as response code 204), some RESTful
   * operations should not return any data. However, GraphQL objects must have
   * a data structure. Normally, these operations would be ignored but for the
   * sake of completeness, the following option will give these operations a
   * placeholder data structure. Even though the data structure will not have
   * any practical use, at least the operations will show up in the schema.
   */
  fillEmptyResponses: boolean

  /**
   * Specifies the URL on which all paths will be based on.
   * Overrides the server object in the OAS.
   */
  baseUrl?: string

  /**
   * Field names can only be beautified operationIds
   *
   * By default, query field names are based on the return type type name and
   * mutation field names are based on the operationId, which may be generated
   * if it does not exist.
   *
   * This option forces OpenAPI-to-GraphQL to only create field names based on the
   * operationId.
   */
  operationIdFieldNames: boolean

  /**
   * Allows to override or add options to the node's request object used to make
   * calls to the API backend.
   * e.g. Setup the web proxy to use.
   */
  requestOptions?: NodeRequest.OptionsWithUrl

  /**
   * The error extensions is part of the GraphQLErrors that will be returned if
   * the query cannot be fulfilled. It provides information about the failed
   * REST call(e.g. the method, path, status code, response
   * headers, and response body). It can be useful for debugging but may
   * unintentionally leak information.
   *
   * This option prevents the extensions from being created.
   */
  provideErrorExtensions: boolean

  /**
   * Allows to define custom resolvers for fields on the query/mutation root
   * operation type.
   *
   * In other words, instead of resolving on an operation (REST call) defined in
   * the OAS, the field will resolve on the custom resolver. Note that this will
   * also affect the behavior of links.
   *
   * The field is identifed first by the title of the OAS, then the path of the
   * operation, and lastly the method of the operation.
   *
   * Use cases include the resolution of complex relationships between types,
   * implementing performance improvements like caching, or dealing with
   * non-standard authentication requirements.
   */
  customResolvers?: {
    [title: string]: { [path: string]: { [method: string]: ResolveFunction } }
  }

  /**
   * Auto-generate a 'limit' argument for all fields that return lists of
   * objects, including ones produced by links
   *
   * Allows to constrain the return size of lists of objects
   *
   * Returns the first n number of elements in the list
   */
  addLimitArgument?: boolean
}

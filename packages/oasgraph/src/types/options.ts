// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: oasgraph
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

/**
 * Type definition of the options that users can pass to OASGraph.
 */
export type Warning = {
  type: string,
  message: string,
  mitigation: string
}

export type Report = {
  warnings: Warning[],
  numOps: number,
  numOpsQuery: number,
  numOpsMutation: number,
  numQueriesCreated: number,
  numMutationsCreated: number
}

export type Options = {
  /**
   * Adhere to the OAS as closely as possible. If set to true, any deviation
   * from the OAS will lead OASGraph to throw.
   */
  strict: boolean,

  /**
   * Custom headers to send with every request made by a resolve function.
   */
  headers?: {[key: string]: string},

  /**
   * Custom query parameters to send with every reqeust by a resolve function.
   */
  qs?: {[key: string]: string},

  /**
   * Determines whether OASGraph should create viewers that allow users to pass
   * basic auth and API key credentials.
   */
  viewer: boolean,

  /**
   * Determines whether OASGraph will attempt to nest operations based on their
   * URL structure (e.g., "/users/{id}" and "/users/{id}/friends").
   */
  addSubOperations: boolean,

  /**
   * JSON path to OAuth 2 token contained in GraphQL context. Tokens will per
   * default be sent in "Authorization" header.
   */
  tokenJSONpath?: string,

  /**
   * Determines whether to send OAuth 2 token as query parameter instead of in
   * header.
   */
  sendOAuthTokenInQuery: boolean,

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
}

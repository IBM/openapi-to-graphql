/* @flow */

/**
 * Type definition of the options that users can pass to OASGraph.
 */

export type Warning = {
  type: string,
  message: string,
  mitigation: string
}

export type Report = {
  warnings: Warning[]
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
  headers?: {[string] : string},

  /**
   * Custom query parameters to send with every reqeust by a resolve function.
   */
  qs?: {[string] : string},

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
}

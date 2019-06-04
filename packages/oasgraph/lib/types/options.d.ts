import * as NodeRequest from 'request'
/**
 * Type definition of the options that users can pass to OASGraph.
 */
export declare type Warning = {
  type: string
  message: string
  mitigation: string
}
export declare type Report = {
  warnings: Warning[]
  numOps: number
  numOpsQuery: number
  numOpsMutation: number
  numQueriesCreated: number
  numMutationsCreated: number
}
export declare type Options = {
  /**
   * Adhere to the OAS as closely as possible. If set to true, any deviation
   * from the OAS will lead OASGraph to throw.
   */
  strict?: boolean
  /**
   * Custom headers to send with every request made by a resolve function.
   */
  headers?: {
    [key: string]: string
  }
  /**
   * Custom query parameters to send with every reqeust by a resolve function.
   */
  qs?: {
    [key: string]: string
  }
  /**
   * Determines whether OASGraph should create viewers that allow users to pass
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
   * This option forces OASGraph to only create field names based on the
   * operationId.
   */
  operationIdFieldNames?: boolean
  /**
   * Allows to override or add options to the node's request object used to make
   * calls to the API backend.
   * e.g. Setup the web proxy to use.
   */
  requestOptions?: NodeRequest.OptionsWithUrl
}
export declare type InternalOptions = {
  /**
   * Adhere to the OAS as closely as possible. If set to true, any deviation
   * from the OAS will lead OASGraph to throw.
   */
  strict: boolean
  /**
   * Custom headers to send with every request made by a resolve function.
   */
  headers?: {
    [key: string]: string
  }
  /**
   * Custom query parameters to send with every reqeust by a resolve function.
   */
  qs?: {
    [key: string]: string
  }
  /**
   * Determines whether OASGraph should create viewers that allow users to pass
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
   * This option forces OASGraph to only create field names based on the
   * operationId.
   */
  operationIdFieldNames: boolean
  /**
   * Allows to override or add options to the node's request object used to make
   * calls to the API backend.
   * e.g. Setup the web proxy to use.
   */
  requestOptions?: NodeRequest.OptionsWithUrl
}

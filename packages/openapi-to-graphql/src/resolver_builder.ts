// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

/**
 * Functions to create resolve functions.
 */

// Type imports:
import { Oas3, SchemaObject } from './types/oas3'
import { Operation, DataDefinition } from './types/operation'
import { ResolveFunction } from './types/graphql'
import { PreprocessingData } from './types/preprocessing_data'
import * as NodeRequest from 'request'

// Imports:
import * as Oas3Tools from './oas_3_tools'
import * as querystring from 'querystring'
import * as JSONPath from 'jsonpath-plus'
import { debug } from 'debug'
import { GraphQLError } from 'graphql'

const translationLog = debug('translation')
const httpLog = debug('http')

// Type definitions & exports:
type AuthReqAndProtcolName = {
  authRequired: boolean
  sanitizedSecurityRequirement?: string
}

type AuthOptions = {
  authHeaders: { [key: string]: string }
  authQs: { [key: string]: string }
  authCookie: NodeRequest.Cookie
}

type GetResolverParams = {
  operation: Operation
  argsFromLink?: { [key: string]: string }
  payloadName?: string
  data: PreprocessingData
  baseUrl?: string
  requestOptions?: NodeRequest.OptionsWithUrl
}

/**
 * Creates and returns a resolver function that performs API requests for the
 * given GraphQL query
 */
export function getResolver({
  operation,
  argsFromLink = {},
  payloadName,
  data,
  baseUrl,
  requestOptions
}: GetResolverParams): ResolveFunction {
  // Determine the appropriate URL:
  if (typeof baseUrl === 'undefined') {
    baseUrl = Oas3Tools.getBaseUrl(operation)
  }

  // Return custom resolver if it is defined
  const customResolvers = data.options.customResolvers
  const title = operation.oas.info.title
  const path = operation.path
  const method = operation.method

  if (
    typeof customResolvers === 'object' &&
    typeof customResolvers[title] === 'object' &&
    typeof customResolvers[title][path] === 'object' &&
    typeof customResolvers[title][path][method] === 'function'
  ) {
    translationLog(`Use custom resolver for ${operation.operationString}`)

    return customResolvers[title][path][method]
  }

  // Return resolve function:
  return (root: any, args, ctx, info = {}) => {
    /**
     * Retch resolveData from possibly existing _openapiToGraphql
     *
     * NOTE: _openapiToGraphql is an object used to pass security info and data
     * from previous resolvers
     */
    let resolveData: any = {}
    if (
      root &&
      typeof root === 'object' &&
      typeof root['_openapiToGraphql'] === 'object' &&
      typeof root['_openapiToGraphql'].data === 'object'
    ) {
      const parentIdentifier = getParentIdentifier(info)
      if (
        !(parentIdentifier.length === 0) &&
        parentIdentifier in root['_openapiToGraphql'].data
      ) {
        /**
         * Resolving link params may change the usedParams, but these changes
         * should not be present in the parent _openapiToGraphql, therefore copy
         * the object
         */
        resolveData = JSON.parse(
          JSON.stringify(root['_openapiToGraphql'].data[parentIdentifier])
        )
      }
    }

    if (typeof resolveData.usedParams === 'undefined') {
      resolveData.usedParams = {}
    }

    /**
     * Handle default values of parameters, if they have not yet been defined by
     * the user.
     */
    operation.parameters.forEach(param => {
      const paramName = Oas3Tools.sanitize(param.name)
      if (
        typeof args[paramName] === 'undefined' &&
        param.schema &&
        typeof param.schema === 'object'
      ) {
        let schema = param.schema
        if (schema && schema.$ref && typeof schema.$ref === 'string') {
          schema = Oas3Tools.resolveRef(schema.$ref, operation.oas)
        }
        if (
          schema &&
          (schema as SchemaObject).default &&
          typeof (schema as SchemaObject).default !== 'undefined'
        ) {
          args[paramName] = (schema as SchemaObject).default
        }
      }
    })

    // Handle arguments provided by links
    for (let paramName in argsFromLink) {
      let value = argsFromLink[paramName]

      let paramNameWithoutLocation = paramName
      if (paramName.indexOf('.') !== -1) {
        paramNameWithoutLocation = paramName.split('.')[1]
      }
      /**
       * see if the link parameter contains constants that are appended to the link parameter
       *
       * e.g. instead of:
       * $response.body#/employerId
       *
       * it could be:
       * abc_{$response.body#/employerId}
       */
      if (value.search(/{|}/) === -1) {
        args[paramNameWithoutLocation] = isRuntimeExpression(value)
          ? resolveLinkParameter(paramName, value, resolveData, root, args)
          : value
      } else {
        // Replace link parameters with appropriate values
        const linkParams = value.match(/{([^}]*)}/g)
        linkParams.forEach(linkParam => {
          value = value.replace(
            linkParam,
            resolveLinkParameter(
              paramName,
              linkParam.substring(1, linkParam.length - 1),
              resolveData,
              root,
              args
            )
          )
        })
        args[paramNameWithoutLocation] = value
      }
    }

    // Stored used parameters to future requests:
    resolveData.usedParams = Object.assign(resolveData.usedParams, args)

    // Build URL (i.e., fill in path parameters):
    const { path, query, headers } = Oas3Tools.instantiatePathAndGetQuery(
      operation.path,
      operation.parameters,
      args
    )
    const url = baseUrl + path

    /**
     * The Content-type and accept property should not be changed because the
     * object type has already been created and unlike these properties, it
     * cannot be easily changed
     *
     * NOTE: This may cause the user to encounter unexpected changes
     */
    headers['content-type'] =
      typeof operation.payloadContentType !== 'undefined'
        ? operation.payloadContentType
        : 'application/json'
    headers['accept'] =
      typeof operation.responseContentType !== 'undefined'
        ? operation.responseContentType
        : 'application/json'

    let options: NodeRequest.OptionsWithUrl
    if (requestOptions) {
      options = { ...requestOptions }
      options['method'] = operation.method
      options['url'] = url
      if (options.headers) {
        Object.assign(options.headers, headers)
      } else {
        options['headers'] = headers
      }
      if (options.qs) {
        Object.assign(options.qs, query)
      } else {
        options['qs'] = query
      }
    } else {
      options = {
        method: operation.method,
        url: url,
        headers: headers,
        qs: query
      }
    }

    /**
     * Determine possible payload
     *
     * GraphQL produces sanitized payload names, so we have to sanitize before
     * lookup here
     */
    resolveData.usedPayload = undefined
    if (payloadName && typeof payloadName === 'string') {
      const sanePayloadName = Oas3Tools.sanitize(payloadName)
      if (sanePayloadName in args) {
        if (typeof args[sanePayloadName] === 'object') {
          // We need to desanitize the payload so the API understands it:
          const rawPayload = JSON.stringify(
            Oas3Tools.desanitizeObjKeys(args[sanePayloadName], data.saneMap)
          )

          options.body = rawPayload
          resolveData.usedPayload = rawPayload
        } else {
          // Payload is not an object (stored as an application/json)
          const rawPayload = args[sanePayloadName]

          options.body = rawPayload
          resolveData.usedPayload = rawPayload
        }
      }
    }

    /**
     * Pass on OpenAPI-to-GraphQL options
     */
    if (typeof data.options === 'object') {
      // Headers:
      if (typeof data.options.headers === 'object') {
        for (let header in data.options.headers) {
          const val = data.options.headers[header]
          options.headers[header] = val
        }
      }
      // Query string:
      if (typeof data.options.qs === 'object') {
        for (let query in data.options.qs) {
          const val = data.options.qs[query]
          options.qs[query] = val
        }
      }
    }

    // Get authentication headers and query parameters
    if (
      root &&
      typeof root === 'object' &&
      typeof root['_openapiToGraphql'] == 'object'
    ) {
      const { authHeaders, authQs, authCookie } = getAuthOptions(
        operation,
        root['_openapiToGraphql'],
        data
      )

      // ...and pass them to the options
      Object.assign(options.headers, authHeaders)
      Object.assign(options.qs, authQs)

      // Add authentication cookie if created
      if (authCookie !== null) {
        const j = NodeRequest.jar()
        j.setCookie(authCookie, options.url)
        options.jar = j
      }
    }

    // Extract OAuth token from context (if available)
    if (data.options.sendOAuthTokenInQuery) {
      const oauthQueryObj = createOAuthQS(data, ctx)
      Object.assign(options.qs, oauthQueryObj)
    } else {
      const oauthHeader = createOAuthHeader(data, ctx)
      Object.assign(options.headers, oauthHeader)
    }

    resolveData.usedRequestOptions = options
    resolveData.usedStatusCode = operation.statusCode

    // Make the call
    httpLog(
      `Call ${options.method.toUpperCase()} ${
        options.url
      }?${querystring.stringify(options.qs)}\n` +
        `headers:${JSON.stringify(options.headers)}`
    )

    return new Promise((resolve, reject) => {
      NodeRequest(options, (err, response, body) => {
        if (err) {
          httpLog(err)
          reject(err)
        } else if (response.statusCode < 200 || response.statusCode > 299) {
          httpLog(`${response.statusCode} - ${Oas3Tools.trim(body, 100)}`)

          const errorString = `Could not invoke operation ${operation.operationString}`

          if (data.options.provideErrorExtensions) {
            let responseBody
            try {
              responseBody = JSON.parse(body)
            } catch (e) {
              responseBody = body
            }

            const extensions = {
              method: operation.method,
              path: operation.path,

              statusCode: response.statusCode,
              responseHeaders: response.headers,
              responseBody
            }
            reject(graphQLErrorWithExtensions(errorString, extensions))
          } else {
            reject(new Error(errorString))
          }

          // Successful response 200-299
        } else {
          httpLog(`${response.statusCode} - ${Oas3Tools.trim(body, 100)}`)

          if (response.headers['content-type']) {
            /**
             * Throw warning if the non-application/json content does not
             * match the OAS.
             *
             * Use an inclusion test in case of charset
             *
             * i.e. text/plain; charset=utf-8
             */
            if (
              !(
                response.headers['content-type'].includes(
                  operation.responseContentType
                ) ||
                operation.responseContentType.includes(
                  response.headers['content-type']
                )
              )
            ) {
              const errorString =
                `Operation ` +
                `${operation.operationString} ` +
                `should have a content-type '${operation.responseContentType}' ` +
                `but has '${response.headers['content-type']}' instead`

              httpLog(errorString)
              reject(errorString)
            } else {
              /**
               * If the response body is type JSON, then parse it
               *
               * content-type may not be necessarily 'application/json' it can be
               * 'application/json; charset=utf-8' for example
               */
              if (
                response.headers['content-type'].includes('application/json')
              ) {
                let responseBody
                try {
                  responseBody = JSON.parse(body)
                } catch (e) {
                  const errorString =
                    `Cannot JSON parse response body of ` +
                    `operation ${operation.operationString} ` +
                    `even though it has content-type 'application/json'`

                  httpLog(errorString)
                  reject(errorString)
                }

                resolveData.responseHeaders = response.headers

                responseBody = stringifyObjectsWithNoProperties(
                  responseBody,
                  operation.responseDefinition
                )

                // Deal with the fact that the server might send unsanitized data
                let saneData = Oas3Tools.sanitizeObjKeys(responseBody)

                // Pass on _openapiToGraphql to subsequent resolvers
                if (saneData && typeof saneData === 'object') {
                  if (Array.isArray(saneData)) {
                    saneData.forEach(element => {
                      if (typeof element['_openapiToGraphql'] === 'undefined') {
                        element['_openapiToGraphql'] = {
                          data: {}
                        }
                      }

                      if (
                        root &&
                        typeof root === 'object' &&
                        typeof root['_openapiToGraphql'] == 'object'
                      ) {
                        Object.assign(
                          element['_openapiToGraphql'],
                          root['_openapiToGraphql']
                        )
                      }

                      element['_openapiToGraphql'].data[
                        getIdentifier(info)
                      ] = resolveData
                    })
                  } else {
                    if (typeof saneData['_openapiToGraphql'] === 'undefined') {
                      saneData['_openapiToGraphql'] = {
                        data: {}
                      }
                    }

                    if (
                      root &&
                      typeof root === 'object' &&
                      typeof root['_openapiToGraphql'] == 'object'
                    ) {
                      Object.assign(
                        saneData['_openapiToGraphql'],
                        root['_openapiToGraphql']
                      )
                    }

                    saneData['_openapiToGraphql'].data[
                      getIdentifier(info)
                    ] = resolveData
                  }
                }

                // Apply limit argument
                if (
                  data.options.addLimitArgument &&
                  /**
                   * NOTE: Does not differentiate between autogenerated args and
                   * preexisting args
                   *
                   * Ensure that there is not preexisting 'limit' argument
                   */
                  !operation.parameters.find(parameter => {
                    return parameter.name === 'limit'
                  }) &&
                  // Only array data
                  Array.isArray(saneData) &&
                  // Only array of objects/arrays
                  saneData.some(data => {
                    return typeof data === 'object'
                  })
                ) {
                  let arraySaneData = saneData

                  if ('limit' in args) {
                    const limit = args['limit']

                    if (limit >= 0) {
                      arraySaneData = arraySaneData.slice(0, limit)
                    } else {
                      reject(
                        new Error(
                          `Auto-generated 'limit' argument must be greater than or equal to 0`
                        )
                      )
                    }
                  } else {
                    reject(
                      new Error(
                        `Cannot get value for auto-generated 'limit' argument`
                      )
                    )
                  }

                  saneData = arraySaneData
                }

                resolve(saneData)
              } else {
                // TODO: Handle YAML

                resolve(body)
              }
            }
          } else {
            /**
             * Check to see if there is not supposed to be a response body,
             * if that is the case, that would explain why there is not
             * a content-type
             */
            const {
              responseContentType,
              responseSchema
            } = Oas3Tools.getResponseSchema(
              operation,
              operation.statusCode,
              operation.oas
            )
            if (responseSchema === null) {
              resolve(null)
            } else {
              const errorString =
                'Response does not have a Content-Type property'

              httpLog(errorString)
              reject(errorString)
            }
          }
        }
      })
    })
  }
}

/**
 * Attempts to create an object to become an OAuth query string by extracting an
 * OAuth token from the ctx based on the JSON path provided in the options.
 */
function createOAuthQS(
  data: PreprocessingData,
  ctx: object
): { [key: string]: string } {
  return typeof data.options.tokenJSONpath !== 'string'
    ? {}
    : extractToken(data, ctx)
}

function extractToken(data: PreprocessingData, ctx: object) {
  const tokenJSONpath = data.options.tokenJSONpath
  const tokens = JSONPath.JSONPath({ path: tokenJSONpath, json: ctx })
  if (Array.isArray(tokens) && tokens.length > 0) {
    const token = tokens[0]
    return {
      access_token: token
    }
  } else {
    httpLog(
      `Warning: could not extract OAuth token from context at '${tokenJSONpath}'`
    )
    return {}
  }
}

/**
 * Attempts to create an OAuth authorization header by extracting an OAuth token
 * from the ctx based on the JSON path provided in the options.
 */
function createOAuthHeader(
  data: PreprocessingData,
  ctx: object
): { [key: string]: string } {
  if (typeof data.options.tokenJSONpath !== 'string') {
    return {}
  }

  // Extract token
  const tokenJSONpath = data.options.tokenJSONpath
  const tokens = JSONPath.JSONPath({ path: tokenJSONpath, json: ctx })
  if (Array.isArray(tokens) && tokens.length > 0) {
    const token = tokens[0]
    return {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'openapi-to-graphql'
    }
  } else {
    httpLog(
      `Warning: could not extract OAuth token from context at ` +
        `'${tokenJSONpath}'`
    )
    return {}
  }
}

/**
 * Returns the headers and query strings to authenticate a request (if any).
 * Object containing authHeader and authQs object,
 * which hold headers and query parameters respectively to authentication a
 * request.
 */
function getAuthOptions(
  operation: Operation,
  _openapiToGraphql: any,
  data: PreprocessingData
): AuthOptions {
  const authHeaders = {}
  const authQs = {}
  let authCookie = null

  /**
   * Determine if authentication is required, and which protocol (if any) we can
   * use
   */
  const {
    authRequired,
    sanitizedSecurityRequirement
  } = getAuthReqAndProtcolName(operation, _openapiToGraphql)
  const securityRequirement = data.saneMap[sanitizedSecurityRequirement]

  // Possibly, we don't need to do anything:
  if (!authRequired) {
    return { authHeaders, authQs, authCookie }
  }

  // If authentication is required, but we can't fulfill the protocol, throw:
  if (authRequired && typeof securityRequirement !== 'string') {
    throw new Error(`Missing information to authenticate API request.`)
  }

  if (typeof securityRequirement === 'string') {
    const security = data.security[securityRequirement]
    switch (security.def.type) {
      case 'apiKey':
        const apiKey =
          _openapiToGraphql.security[sanitizedSecurityRequirement].apiKey
        if ('in' in security.def) {
          if (typeof security.def.name === 'string') {
            if (security.def.in === 'header') {
              authHeaders[security.def.name] = apiKey
            } else if (security.def.in === 'query') {
              authQs[security.def.name] = apiKey
            } else if (security.def.in === 'cookie') {
              authCookie = NodeRequest.cookie(`${security.def.name}=${apiKey}`)
            }
          } else {
            throw new Error(
              `Cannot send API key in '${JSON.stringify(security.def.in)}'`
            )
          }
        }
        break

      case 'http':
        switch (security.def.scheme) {
          case 'basic':
            const username =
              _openapiToGraphql.security[sanitizedSecurityRequirement].username
            const password =
              _openapiToGraphql.security[sanitizedSecurityRequirement].password
            const credentials = `${username}:${password}`
            authHeaders['Authorization'] = `Basic ${Buffer.from(
              credentials
            ).toString('base64')}`
            break
          default:
            throw new Error(
              `Cannot recognize http security scheme ` +
                `'${JSON.stringify(security.def.scheme)}'`
            )
        }
        break

      case 'oauth2':
        break

      case 'openIdConnect':
        break

      default:
        throw new Error(`Cannot recognize security type '${security.def.type}'`)
    }
  }
  return { authHeaders, authQs, authCookie }
}

/**
 * Determines whether given operation requires authentication, and which of the
 * (possibly multiple) authentication protocols can be used based on the data
 * present in the given context.
 */
function getAuthReqAndProtcolName(
  operation: Operation,
  _openapiToGraphql
): AuthReqAndProtcolName {
  let authRequired = false
  if (
    Array.isArray(operation.securityRequirements) &&
    operation.securityRequirements.length > 0
  ) {
    authRequired = true

    for (let securityRequirement of operation.securityRequirements) {
      const sanitizedSecurityRequirement = Oas3Tools.sanitize(
        securityRequirement
      )
      if (
        typeof _openapiToGraphql.security[sanitizedSecurityRequirement] ===
        'object'
      ) {
        return {
          authRequired,
          sanitizedSecurityRequirement
        }
      }
    }
  }
  return {
    authRequired
  }
}

/**
 * Given a link parameter, determine the value
 *
 * The link parameter is a reference to data contained in the
 * url/method/statuscode or response/request body/query/path/header
 */
function resolveLinkParameter(
  paramName: string,
  value: string,
  resolveData: any,
  root: any,
  args: any
): any {
  if (value === '$url') {
    return resolveData.usedRequestOptions.url
  } else if (value === '$method') {
    return resolveData.usedRequestOptions.method
  } else if (value === '$statusCode') {
    return resolveData.usedStatusCode
  } else if (value.startsWith('$request.')) {
    // CASE: parameter is previous body
    if (value === '$request.body') {
      return resolveData.usedPayload

      // CASE: parameter in previous body
    } else if (value.startsWith('$request.body#')) {
      const tokens = JSONPath.JSONPath({
        path: value.split('body#/')[1],
        json: resolveData.usedPayload
      })
      if (Array.isArray(tokens) && tokens.length > 0) {
        return tokens[0]
      } else {
        httpLog(`Warning: could not extract parameter '${paramName}' from link`)
      }

      // CASE: parameter in previous query parameter
    } else if (value.startsWith('$request.query')) {
      return resolveData.usedParams[
        Oas3Tools.sanitize(value.split('query.')[1])
      ]

      // CASE: parameter in previous path parameter
    } else if (value.startsWith('$request.path')) {
      return resolveData.usedParams[Oas3Tools.sanitize(value.split('path.')[1])]

      // CASE: parameter in previous header parameter
    } else if (value.startsWith('$request.header')) {
      return resolveData.usedRequestOptions.headers[value.split('header.')[1]]
    }
  } else if (value.startsWith('$response.')) {
    /**
     * CASE: parameter is body
     *
     * NOTE: may not be used because it implies that the operation does not
     * return a JSON object and OpenAPI-to-GraphQL does not create GraphQL
     * objects for non-JSON data and links can only exists between objects.
     */
    if (value === '$response.body') {
      const result = JSON.parse(JSON.stringify(root))
      /**
       * _openapiToGraphql contains data used by OpenAPI-to-GraphQL to create the GraphQL interface
       * and should not be exposed
       */
      result._openapiToGraphql = undefined
      return result

      // CASE: parameter in body
    } else if (value.startsWith('$response.body#')) {
      const tokens = JSONPath.JSONPath({
        path: value.split('body#/')[1],
        json: root
      })
      if (Array.isArray(tokens) && tokens.length > 0) {
        return tokens[0]
      } else {
        httpLog(`Warning: could not extract parameter '${paramName}' from link`)
      }

      // CASE: parameter in query parameter
    } else if (value.startsWith('$response.query')) {
      // NOTE: handled the same way $request.query is handled
      return resolveData.usedParams[
        Oas3Tools.sanitize(value.split('query.')[1])
      ]

      // CASE: parameter in path parameter
    } else if (value.startsWith('$response.path')) {
      // NOTE: handled the same way $request.path is handled
      return resolveData.usedParams[Oas3Tools.sanitize(value.split('path.')[1])]

      // CASE: parameter in header parameter
    } else if (value.startsWith('$response.header')) {
      return resolveData.responseHeaders[value.split('header.')[1]]
    }
  }

  throw new Error(
    `Cannot create link because '${value}' is an invalid runtime expression`
  )
}

/**
 * Check if a string is a runtime expression in the context of link parameters
 */
function isRuntimeExpression(str: string): boolean {
  const references = ['header.', 'query.', 'path.', 'body']

  if (str === '$url' || str === '$method' || str === '$statusCode') {
    return true
  } else if (str.startsWith('$request.')) {
    for (let i = 0; i < references.length; i++) {
      if (str.startsWith(`$request.${references[i]}`)) {
        return true
      }
    }
  } else if (str.startsWith('$response.')) {
    for (let i = 0; i < references.length; i++) {
      if (str.startsWith(`$response.${references[i]}`)) {
        return true
      }
    }
  }

  return false
}

/**
 * From the info object provided by the resolver, get a unique identifier, which
 * is the path formed from the nested field names (or aliases if provided)
 *
 * Used to store and retrieve the _openapiToGraphql of parent field
 */
function getIdentifier(info): string {
  return getIdentifierRecursive(info.path)
}

/**
 * From the info object provided by the resolver, get the unique identifier of
 * the parent object
 */
function getParentIdentifier(info): string {
  return getIdentifierRecursive(info.path.prev)
}

/**
 * Get the path of nested field names (or aliases if provided)
 */
function getIdentifierRecursive(path): string {
  return typeof path.prev === 'undefined'
    ? path.key
    : /**
     * Check if the identifier contains array indexing, if so remove.
     *
     * i.e. instead of 0/friends/1/friends/2/friends/user, create
     * friends/friends/friends/user
     */
    isNaN(parseInt(path.key))
    ? `${path.key}/${getIdentifierRecursive(path.prev)}`
    : getIdentifierRecursive(path.prev)
}

/**
 * Create a new GraphQLError with an extensions field
 */
function graphQLErrorWithExtensions(
  message: string,
  extensions: { [key: string]: any }
): GraphQLError {
  return new GraphQLError(message, null, null, null, null, null, extensions)
}

/**
 * Ideally, all objects should be defined with properties. However, if they are
 * not, then we can at least stringify the data.
 *
 * This function recursively ensures that objects have properties, if not
 * stringify the data to match the mitigation.
 */
function stringifyObjectsWithNoProperties(
  data: any,
  dataDef: DataDefinition
): any {
  if (typeof dataDef !== 'undefined') {
    if (dataDef.type === 'array') {
      data = data.map(element => {
        return stringifyObjectsWithNoProperties(
          element,
          dataDef.subDefinitions as DataDefinition
        )
      })
    } else if (dataDef.type === 'object') {
      if (typeof dataDef.schema.properties !== 'undefined') {
        Object.keys(data).forEach(propertyName => {
          data[propertyName] = stringifyObjectsWithNoProperties(
            data[propertyName],
            dataDef.subDefinitions[propertyName]
          )
        })

        // Schema does not have properties defined, therefore stringify
      } else {
        return JSON.stringify(data)
      }
    }
  }

  return data
}

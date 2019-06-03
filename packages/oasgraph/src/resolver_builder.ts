// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: oasgraph
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

/**
 * Functions to create resolve functions.
 */

// Type imports:
import { Oas3, SchemaObject } from './types/oas3'
import { Operation } from './types/operation'
import { ResolveFunction } from './types/graphql'
import { PreprocessingData } from './types/preprocessing_data'
import * as NodeRequest from 'request'

// Imports:
import * as Oas3Tools from './oas_3_tools'
import * as querystring from 'querystring'
import * as JSONPath from 'jsonpath-plus'
import { debug } from 'debug'
import { GraphQLError } from 'graphql'

const log = debug('http')
// Type definitions & exports:

type AuthReqAndProtcolName = {
  authRequired: boolean,
  beautifiedSecurityRequirement?: string
}

type AuthOptions = {
  authHeaders: { [key: string]: string },
  authQs: { [key: string]: string },
  authCookie: NodeRequest.Cookie
}

type GetResolverParams = {
  operation: Operation,
  argsFromLink?: { [key: string]: string },
  argsFromParent?: string[],
  payloadName?: string,
  data: PreprocessingData,
  baseUrl?: string,
  requestOptions?: NodeRequest.OptionsWithUrl
}
/**
 * Creates and returns a resolver function that performs API requests for the
 * given GraphQL query
 */
export function getResolver({
  operation,
  argsFromLink = {},
  argsFromParent = [],
  payloadName,
  data,
  baseUrl,
  requestOptions
}: GetResolverParams): ResolveFunction {
  // determine the appropriate URL:
  if (typeof baseUrl === 'undefined') {
    baseUrl = Oas3Tools.getBaseUrl(operation)
  }

  // return resolve function:
  return (root: any, args, ctx, info = {}) => {
    // fetch resolveData from possibly existing _oasgraph
    // NOTE: _oasgraph is an object used to pass security info and data from
    // previous resolvers
    let resolveData: any = {}
    if (root &&
      typeof root === 'object' &&
      typeof root._oasgraph === 'object' &&
      typeof root._oasgraph.data === 'object') {
      let parentIdentifier = getParentIdentifier(info)
      if (!(parentIdentifier.length === 0) && parentIdentifier in root._oasgraph.data) {
        // resolving link params may change the usedParams, but these changes
        // should not be present in the parent _oasgraph, therefore copy the object
        resolveData = JSON.parse(JSON.stringify(root._oasgraph.data[parentIdentifier]))
      }
    }

    if (typeof resolveData.usedParams === 'undefined') {
      resolveData.usedParams = {}
    }

    /**
     * handle arguments provided by parent - we reuse parameters populated in
     * previous calls from the context
     */
    for (let argName of argsFromParent) {
      args[argName] = resolveData.usedParams[argName]
    }

    /**
     * Handle default values of parameters, if they have not yet been defined by
     * the user.
     */
    operation.parameters.forEach(param => {
      let paramName = Oas3Tools.beautify(param.name)
      if (typeof args[paramName] === 'undefined' && param.schema && typeof param.schema === 'object') {
        let schema = param.schema
        if (schema && schema.$ref && typeof schema.$ref === 'string') {
          schema = Oas3Tools.resolveRef(schema.$ref, operation.oas)
        }
        if (schema && (schema as SchemaObject).default &&
         typeof (schema as SchemaObject).default !== 'undefined') {
          args[paramName] = (schema as SchemaObject).default
        }
      }
    })

    // handle arguments provided by links
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
        args[paramNameWithoutLocation] = (isRuntimeExpression(value)) ? resolveLinkParameter(paramName, value, resolveData, root, args) : value
      } else {
        // replace link parameters with appropriate values
        let linkParams = value.match(/{([^}]*)}/g)
        linkParams.forEach((linkParam) => {
          value = value.replace(linkParam, resolveLinkParameter(paramName, linkParam.substring(1, linkParam.length - 1), resolveData, root, args))
        })
        args[paramNameWithoutLocation] = value
      }
    }

    // stored used parameters to future requests:
    resolveData.usedParams = Object.assign(resolveData.usedParams, args)

    // build URL (i.e., fill in path parameters):
    let { path, query, headers } = Oas3Tools.instantiatePathAndGetQuery(
      operation.path,
      operation.parameters,
      args)
    let url = baseUrl + path

    // The Content-type and accept property should not be changed because the
    // object type has already been created and unlike these properties, it
    // cannot be easily changed
    //
    // NOTE: This may cause the user to encounter unexpected changes
    headers['content-type'] = typeof (operation.payloadContentType) !== 'undefined' ? operation.payloadContentType : 'application/json'
    headers['accept'] = typeof (operation.responseContentType) !== 'undefined' ? operation.responseContentType : 'application/json'

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
     * GraphQL produces sanitized payload names, so we have to sanitize before
     * lookup here
     */
    resolveData.usedPayload = undefined
    if (payloadName && typeof payloadName === 'string') {
      let sanePayloadName = Oas3Tools.beautify(payloadName)
      if (sanePayloadName in args) {
        if (typeof args[sanePayloadName] === 'object') {
          // we need to desanitize the payload so the API understands it:
          let rawPayload = JSON.stringify(Oas3Tools.desanitizeObjKeys(
            args[sanePayloadName], data.saneMap))

          options.body = rawPayload
          resolveData.usedPayload = rawPayload

        } else {
          // payload is not an object (stored as an application/json)
          let rawPayload = args[sanePayloadName]

          options.body = rawPayload
          resolveData.usedPayload = rawPayload
        }
      }
    }

    /**
     * Pass on OASGraph options
     */
    if (typeof data.options === 'object') {
      // headers:
      if (typeof data.options.headers === 'object') {
        for (let header in data.options.headers) {
          let val = data.options.headers[header]
          options.headers[header] = val
        }
      }
      // query string:
      if (typeof data.options.qs === 'object') {
        for (let query in data.options.qs) {
          let val = data.options.qs[query]
          options.qs[query] = val
        }
      }
    }

    // get authentication headers and query parameters
    if (root &&
      typeof root === 'object' &&
      typeof root._oasgraph == 'object') {
      let { authHeaders, authQs, authCookie } = getAuthOptions(operation, root._oasgraph, data)

      // ...and pass them to the options
      Object.assign(options.headers, authHeaders)
      Object.assign(options.qs, authQs)

      // add authentication cookie if created
      if (authCookie !== null) {
        const j = NodeRequest.jar()
        j.setCookie(authCookie, options.url)
        options.jar = j
      }
    }

    // extract OAuth token from context (if available)
    if (data.options.sendOAuthTokenInQuery) {
      let oauthQueryObj = createOAuthQS(data, ctx)
      Object.assign(options.qs, oauthQueryObj)
    } else {
      let oauthHeader = createOAuthHeader(data, ctx)
      Object.assign(options.headers, oauthHeader)
    }

    resolveData.usedRequestOptions = options
    resolveData.usedStatusCode = operation.statusCode

    // make the call
    log(`Call ${options.method.toUpperCase()} ${options.url}?${querystring.stringify(options.qs)}` +
    `headers:${JSON.stringify(options.headers)}`)
    return new Promise((resolve, reject) => {
      NodeRequest(options, (err, response, body) => {
        if (err) {
          log(err)
          reject(err)
        } else if (response.statusCode > 299) {
          log(`${response.statusCode} - ${Oas3Tools.trim(body, 100)}`)

          const operationString = `${operation.method.toUpperCase()} ${operation.path}`
          const extensions = {
            method: operation.method,
            path: operation.path, 

            statusCode: response.statusCode,
            responseHeaders: response.headers,
            responseBody: JSON.parse(body)
          }
          reject(graphQLErrorWithExtensions(`Could not invoke operation ${operationString}`, extensions))

        } else {
          log(`${response.statusCode} - ${Oas3Tools.trim(body, 100)}`)

          if (response.headers['content-type']) {
            // if the response body is type JSON, then parse it
            //
            // content-type may not be necessarily 'application/json'
            // it can be 'application/json; charset=utf-8' for example
            if (response.headers['content-type'].includes('application/json')) {
              body = JSON.parse(body)
            }
          } else {
            log('Warning: response does not have a Content-Type property')
          }

          resolveData.responseHeaders = response.headers

          // deal with the fact that the server might send unsanitized data
          // let saneData: any = Oas3Tools.sanitizeObjKeys(body)
          let saneData: any = Oas3Tools.sanitizeObjKeys(body)

          // pass on _oasgraph to subsequent resolvers
          if (saneData &&
            typeof saneData === 'object') {
            if (Array.isArray(saneData)) {
              saneData.forEach((element) => {
                if (typeof element._oasgraph === 'undefined') {
                  element._oasgraph = {
                    data: {}
                  }
                }

                if (root &&
                  typeof root === 'object' &&
                  typeof root._oasgraph == 'object') {
                  Object.assign(element._oasgraph, root._oasgraph)
                }

                element._oasgraph.data[getIdentifier(info)] = resolveData
              })
            } else {
              if (typeof saneData._oasgraph === 'undefined') {
                saneData._oasgraph = {
                  data: {}
                }
              }

              if (root &&
                typeof root === 'object' &&
                typeof root._oasgraph == 'object') {
                Object.assign(saneData._oasgraph, root._oasgraph)
              }

              saneData._oasgraph.data[getIdentifier(info)] = resolveData
            }
          }

          resolve(saneData)
        }
      })
    })
  }
}

/**
 * Attempts to create an object to become an OAuth query string by extracting an
 * OAuth token from the ctx based on the JSON path provided in the options.
 */
function createOAuthQS ( data: PreprocessingData, ctx: Object ): { [key: string]: string } {
  return (typeof data.options.tokenJSONpath !== 'string') ? {} : extractToken(data, ctx)
}

function extractToken(data: PreprocessingData, ctx: Object) {
  let tokenJSONpath = data.options.tokenJSONpath
  let tokens = JSONPath.JSONPath({ path: tokenJSONpath, json: ctx })
  if (Array.isArray(tokens) && tokens.length > 0) {
    let token = tokens[0]
    return {
      access_token: token
    }
  } else {
    log(`Warning: could not extract OAuth token from context at '${tokenJSONpath}'`)
    return {}
  }
}

/**
 * Attempts to create an OAuth authorization header by extracting an OAuth token
 * from the ctx based on the JSON path provided in the options.
 */
function createOAuthHeader (
  data: PreprocessingData,
  ctx: Object
): { [key: string]: string } {
  if (typeof data.options.tokenJSONpath !== 'string') {
    return {}
  }

  // extract token
  let tokenJSONpath = data.options.tokenJSONpath
  let tokens = JSONPath.JSONPath({ path: tokenJSONpath, json: ctx })
  if (Array.isArray(tokens) && tokens.length > 0) {
    let token = tokens[0]
    return {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'oasgraph'
    }
  } else {
    log(`Warning: could not extract OAuth token from context at ` +
      `'${tokenJSONpath}'`)
    return {}
  }
}

/**
 * Returns the headers and query strings to authenticate a request (if any).
 * Object containing authHeader and authQs object,
 * which hold headers and query parameters respectively to authentication a
 * request.
 */
function getAuthOptions (
  operation: Operation,
  _oasgraph: any,
  data: PreprocessingData
): AuthOptions {
  let authHeaders = {}
  let authQs = {}
  let authCookie = null

  // determine if authentication is required, and which protocol (if any) we
  // can use
  let { authRequired, beautifiedSecurityRequirement } = getAuthReqAndProtcolName(
    operation, _oasgraph)
  let securityRequirement = data.saneMap[beautifiedSecurityRequirement]

  // possibly, we don't need to do anything:
  if (!authRequired) {
    return { authHeaders, authQs, authCookie }
  }

  // if authentication is required, but we can't fulfill the protocol, throw:
  if (authRequired && typeof securityRequirement !== 'string') {
    throw new Error(`Missing information to authenticate API request.`)
  }

  if (typeof securityRequirement === 'string') {
    let security = data.security[securityRequirement]
    switch (security.def.type) {
      case 'apiKey':
        let apiKey = _oasgraph.security[beautifiedSecurityRequirement].apiKey
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
            throw new Error(`Cannot send apiKey in '${JSON.stringify(security.def.in)}'`)
          }
        }
        break

      case 'http':
        switch (security.def.scheme) {
          case 'basic':
            const username = _oasgraph.security[beautifiedSecurityRequirement].username
            const password = _oasgraph.security[beautifiedSecurityRequirement].password
            const credentials = `${username}:${password}`
            authHeaders['Authorization'] = `Basic ${Buffer.from(credentials).toString('base64')}`
            break
          default:
            throw new Error(`Cannot recognize http security scheme ` +
              `'${JSON.stringify(security.def.scheme)}'`)
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
  _oasgraph
): AuthReqAndProtcolName {
  let authRequired = false
  if (Array.isArray(operation.securityRequirements) &&
    operation.securityRequirements.length > 0) {
    authRequired = true

    for (let securityRequirement of operation.securityRequirements) {
      let beautifiedSecurityRequirement = Oas3Tools.beautify(securityRequirement)
      if (typeof _oasgraph.security[beautifiedSecurityRequirement] === 'object') {
        return {
          authRequired,
          beautifiedSecurityRequirement
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
function resolveLinkParameter(paramName: string, value: string, resolveData: any, root: any, args: any): any {
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
      let tokens = JSONPath.JSONPath({ path: value.split('body#/')[1], json: resolveData.usedPayload })
      if (Array.isArray(tokens) && tokens.length > 0) {
        return tokens[0]
      } else {
        log(`Warning: could not extract parameter ${paramName} from link`)
      }

      // CASE: parameter in previous query parameter
    } else if (value.startsWith('$request.query')) {
      return resolveData.usedParams[Oas3Tools.beautify(value.split('query.')[1])]

      // CASE: parameter in previous path parameter
    } else if (value.startsWith('$request.path')) {
      return resolveData.usedParams[Oas3Tools.beautify(value.split('path.')[1])]

      // CASE: parameter in previous header parameter
    } else if (value.startsWith('$request.header')) {
      return resolveData.usedRequestOptions.headers[value.split('header.')[1]]
    }

  } else if (value.startsWith('$response.')) {
    // CASE: parameter is body
    // NOTE: may not be used because it implies that the operation does not return
    // a JSON object and OASGraph does not create GraphQL objects for non-JSON
    // data and links can only exists between objects. 
    if (value === '$response.body') {
      let result = JSON.parse(JSON.stringify(root))
      /**
       * _oasgraph contains data used by OASGraph to create the GraphQL interface 
       * and should not be exposed
       */
      result._oasgraph = undefined
      return result

      // CASE: parameter in body
    } else if (value.startsWith('$response.body#')) {
      let tokens = JSONPath.JSONPath({ path: value.split('body#/')[1], json: root })
      if (Array.isArray(tokens) && tokens.length > 0) {
        return tokens[0]
      } else {
        log(`Warning: could not extract parameter ${paramName} from link`)
      }

      // CASE: parameter in query parameter
    } else if (value.startsWith('$response.query')) {
      // NOTE: handled the same way $request.query is handled
      return resolveData.usedParams[Oas3Tools.beautify(value.split('query.')[1])]

      // CASE: parameter in path parameter
    } else if (value.startsWith('$response.path')) {
      // NOTE: handled the same way $request.path is handled
      return resolveData.usedParams[Oas3Tools.beautify(value.split('path.')[1])]

      // CASE: parameter in header parameter
    } else if (value.startsWith('$response.header')) {
      return resolveData.responseHeaders[value.split('header.')[1]]
    }
  }

  throw new Error(`Cannot create link because "${value}" is an invalid runtime expression`)
}

/**
 * Check if a string is a runtime expression in the context of link parameters
 */
function isRuntimeExpression(str: string): boolean {
  let references = ['header.', 'query.', 'path.', 'body']

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
 * Used to store and retrieve the _oasgraph of parent field
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
  return (typeof path.prev === 'undefined') ? path.key : `${path.key}/${getIdentifierRecursive(path.prev)}`
}

/**
 * Create a new GraphQLError with an extensions field
 */
function graphQLErrorWithExtensions(message: string, extensions: { [key: string]: any }): GraphQLError {
  return new GraphQLError(message, null, null, null, null, null, extensions)
}
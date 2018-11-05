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

// Imports:
import * as request from 'request'
import * as Oas3Tools from './oas_3_tools'
import * as querystring from 'querystring'
import * as JSONPath from 'jsonpath-plus'
import debug from 'debug'

// Type definitions & exports:
type GetResolverParams = {
  operation: Operation,
  argsFromLink?: {[key: string]: string},
  argsFromParent?: string[],
  payloadName?: string,
  data: PreprocessingData,
  oas: Oas3
}

type RequestOptions = {
  method: string,
  url: string,
  headers: {[key: string]: string},
  qs: {[key: string]: string},
  body?: (Object | Array<any> | string)
}

type AuthReqAndProtcolName = {
  authRequired: boolean,
  securityRequirement?: string
}

type AuthOptions = {
  authHeaders: {[key: string]: string},
  authQs: {[key: string]: string}
}

const log = debug('http')

/**
 * Creates and returns a resolver function that performs API requests for the
 * given GraphQL query
 */
export function getResolver ({
  operation,
  argsFromLink = {},
  argsFromParent = [],
  payloadName,
  data,
  oas
}: GetResolverParams): ResolveFunction {
  // determine the appropriate URL:
  let baseUrl = Oas3Tools.getBaseUrl(oas, operation)

  // return resolve function:
  return (root: any, args, ctx = {}) => {
    // fetch possibly existing _oasgraph
    // NOTE: _oasgraph is an object used to pass security information
    let _oasgraph: any = {}
    if (root && typeof root === 'object' &&
      typeof root._oasgraph === 'object') {
      _oasgraph = root._oasgraph
    }
    if (typeof _oasgraph.usedParams === 'undefined') {
      _oasgraph.usedParams = {}
    }

    // handle arguments provided by links
    for (let paramName in argsFromLink) {
      let value = argsFromLink[paramName]

      // parameter names can specify location of parameter (e.g., path.id)
      let paramNameWithoutLocation = paramName
      if (paramName.indexOf('.') !== -1) {
        paramNameWithoutLocation = paramName.split('.')[1]
      }

      // CASE: parameter in body
      if (/body#/.test(value)) {
        let tokens = JSONPath.JSONPath({ path: value.split('body#/')[1], json: root })
        if (Array.isArray(tokens) && tokens.length > 0) {
          args[paramNameWithoutLocation] = tokens[0]
        } else {
          log(`Warning: could not extract parameter ${paramName} form link`)
        }
      // CASE: parameter in previous query parameter
      } else if (/query\./.test(value)) {
        args[paramNameWithoutLocation] =
          _oasgraph.usedParams[Oas3Tools.beautify(value.split('query.')[1])]
      // CASE: parameter in previous path parameter
      } else if (/path\./.test(value)) {
        args[paramNameWithoutLocation] =
          _oasgraph.usedParams[Oas3Tools.beautify(value.split('path.')[1])]
      // CASE: link OASGraph currently does not support
      } else {
        log(`Warning: could not process link parameter ${paramName} with ` +
          `value ${value}`)
      }
    }

    /**
     * handle arguments provided by parent - we reuse parameters populated in
     * previous calls from the context
     */
    for (let argName of argsFromParent) {
      args[argName] = _oasgraph.usedParams[argName]
    }

    /**
     * Handle default values of parameters, if they have not yet been defined by
     * the user.
     */
    operation.parameters.forEach(param => {
      let paramName = Oas3Tools.beautify(param.name)
      if (typeof args[paramName] === 'undefined' &&
      param.schema && typeof param.schema === 'object') {
        let schema = param.schema
        if (schema && schema.$ref && typeof schema.$ref === 'string') {
          schema = Oas3Tools.resolveRef(schema.$ref, oas)
        }
        if (schema && (schema as SchemaObject).default
          && typeof (schema as SchemaObject).default !== 'undefined') {
          args[paramName] = (schema as SchemaObject).default
        }
      }
    })

    // stored used parameters to future requests:
    _oasgraph.usedParams = Object.assign(_oasgraph.usedParams, args)

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
    // NOTE: This may cause the use to encounter unexpected changes
    headers['content-type'] = typeof(operation.payloadContentType) !== 'undefined' ? operation.payloadContentType : 'application/json'
    headers['accept'] = typeof(operation.responseContentType) !== 'undefined' ? operation.responseContentType : 'application/json'

    let options: RequestOptions = {
      method: operation.method,
      url: url,
      headers: headers,
      qs: query
    }

    /**
     * Determine possible payload
     * GraphQL produces sanitized payload names, so we have to sanitize before
     * lookup here
     */
    if (payloadName && typeof payloadName === 'string') {
      let sanePayloadName = Oas3Tools.beautify(payloadName)
      if (sanePayloadName in args) {
        // we need to desanitize the payload so the API understands it:
        let rawPayload = Oas3Tools.desanitizeObjKeys(
          args[sanePayloadName], data.saneMap)
        options.body = JSON.stringify(rawPayload)
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
    let { authHeaders, authQs } = getAuthOptions(operation, _oasgraph, data)

    // ...and pass them to the options
    Object.assign(options.headers, authHeaders)
    Object.assign(options.qs, authQs)

    // extract OAuth token from context (if available)
    if (data.options.sendOAuthTokenInQuery) {
      let oauthQueryObj = createOAuthQS(data, ctx)
      Object.assign(options.qs, oauthQueryObj)
    } else {
      let oauthHeader = createOAuthHeader(data, ctx)
      Object.assign(options.headers, oauthHeader)
    }

    // make the call
    log(`Call ${options.method.toUpperCase()} ${options.url}` +
      `?${querystring.stringify(options.qs)} ` +
      `headers:${JSON.stringify(options.headers)}`)
    return new Promise((resolve, reject) => {
      request(options, (err, response, body) => {
        if (err) {
          log(err)
          reject(err)
        } else if (response.statusCode > 299) {
          log(`${response.statusCode} - ${Oas3Tools.trim(body, 100)}`)
          reject(new Error(`${response.statusCode} - ${JSON.stringify(body)}`))
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

          // deal with the fact that the server might send unsanitized data
          // let saneData: any = Oas3Tools.sanitizeObjKeys(body)
          let saneData: any = Oas3Tools.sanitizeObjKeys(body)

          // pass on _oasgraph to subsequent resolvers
          if (saneData &&
            typeof saneData === 'object' &&
            !Array.isArray(saneData)) {
            saneData._oasgraph = _oasgraph
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
function createOAuthQS (
  data: PreprocessingData,
  ctx: Object
): {[key: string]: string} {
  if (typeof data.options.tokenJSONpath !== 'string') {
    return {}
  }

  // extract token:
  let tokenJSONpath = data.options.tokenJSONpath
  let tokens = JSONPath.JSONPath({ path: tokenJSONpath, json: ctx })
  if (Array.isArray(tokens) && tokens.length > 0) {
    let token = tokens[0]
    return {
      access_token: token
    }
  } else {
    log(`Warning: could not extract OAuth token from context at ` +
      `"${tokenJSONpath}"`)
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
): {[key: string]: string} {
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
      `"${tokenJSONpath}"`)
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

  // determine if authentication is required, and which protocol (if any) we
  // can use
  let { authRequired, securityRequirement } = getAuthReqAndProtcolName(
    operation, _oasgraph, data)

  // possibly, we don't need to do anything:
  if (!authRequired) {
    return { authHeaders, authQs }
  }

  // if authentication is required, but we can't fulfill the protocol, throw:
  if (authRequired && typeof securityRequirement !== 'string') {
    throw new Error(`Missing information to authenticate API request.`)
  }

  if (typeof securityRequirement === 'string') {
    let security = data.security[securityRequirement]
    switch (security.def.type) {
      case 'apiKey':
        let apiKey = _oasgraph.security[securityRequirement].apiKey
        if ('in' in security.def) {
          if (security.def.in === 'header' &&
            typeof security.def.name === 'string') {
            authHeaders[security.def.name] = apiKey
          } else if (security.def.in === 'query' &&
            typeof security.def.name === 'string') {
            authQs[security.def.name] = apiKey
          } else {
            throw new Error(`Cannot send apiKey in ` +
              `'${JSON.stringify(security.def.in)}'`)
          }
        }
        break

      case 'http':
        switch (security.def.scheme) {
          case 'basic':
            let username = _oasgraph.security[securityRequirement].username
            let password = _oasgraph.security[securityRequirement].password
            authHeaders['Authorization'] = 'Basic ' +
              Buffer.from(username + ':' + password).toString('base64')
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

  return { authHeaders, authQs }
}

/**
 * Determines whether given operation requires authentication, and which of the
 * (possibly multiple) authentication protocols can be used based on the data
 * present in the given context.
 */
function getAuthReqAndProtcolName (
  operation: Operation,
  _oasgraph,
  data: PreprocessingData
): AuthReqAndProtcolName {
  let authRequired = false
  if (Array.isArray(operation.securityRequirements) &&
    operation.securityRequirements.length > 0) {
    authRequired = true

    for (let securityRequirement of operation.securityRequirements) {
      if (typeof _oasgraph.security[securityRequirement] === 'object') {
        return {
          authRequired,
          securityRequirement
        }
      }
    }
  }
  return {
    authRequired
  }
}

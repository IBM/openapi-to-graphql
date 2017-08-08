/* @flow */

'use strict'

/**
 * Functions to create resolve functions.
 */

// Type imports:
import type {
  Oas3
} from './types/oas3.js'
import type {Operation} from './types/operation.js'
import type {PreprocessingData} from './types/preprocessing_data.js'

// Type definitions & exports:
export type ResolveFunction =
  (root: Object, args: Object, ctx: Object) => Promise<any> | any

type GetResolverParams = {
  operation: Operation,
  argsFromLink?: {[string] : string},
  argsFromParent?: string[],
  payloadName?: ?string,
  data: PreprocessingData,
  oas: Oas3
}

type RequestOptions = {
  method: string,
  url: string,
  json: true,
  headers: {[string] : string},
  qs: {[string] : string},
  body?: ?(Object | Array<any> | string)
}

type AuthReqAndProtcolName = {
  authRequired: boolean,
  protocolName?: string
}

type AuthOptions = {
  authHeaders: {[string] : string},
  authQs: {[string] : string}
}

// Imports:
import request from 'request'
import Oas3Tools from './oas_3_tools.js'
import querystring from 'querystring'
import jp from 'jsonpath'
import debug from 'debug'

const log = debug('http')

/**
 * Creates and returns a resolver function that performs API requests for the
 * given GraphQL query
 */
const getResolver = ({
  operation,
  argsFromLink = {},
  argsFromParent = [],
  payloadName,
  data,
  oas
} : GetResolverParams) : ResolveFunction => {
  // determine the appropriate URL:
  let baseUrl = Oas3Tools.getBaseUrl(oas, operation)

  // return resolve function:
  return (root, args, ctx = {}) => {
    // fetch possibly existing _oasgraph
    // NOTE: _oasgraph is an object used to pass security information
    let _oasgraph = {}
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
        let tokens = jp.query(root, value.split('body#/')[1])
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
        log(`Warnung: could not process link parameter ${paramName} with ` +
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

    // stored used parameters to future requests:
    _oasgraph.usedParams = Object.assign(_oasgraph.usedParams, args)

    // build URL (i.e., fill in path parameters):
    let {path, query} = Oas3Tools.instantiatePathAndGetQuery(
      operation.path,
      operation.parameters,
      args)
    let url = baseUrl + path
    let options: RequestOptions = {
      method: operation.method,
      url: url,
      json: true,
      headers: {},
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
        options.body = rawPayload
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
    let {authHeaders, authQs} = getAuthOptions(operation, _oasgraph, data)

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
          // deal with the fact that the server might send unsanitized data
          let saneData = Oas3Tools.sanitizeObjKeys(body)

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
const createOAuthQS = (
  data: PreprocessingData,
  ctx: Object
) : {[string] : string} => {
  if (typeof data.options.tokenJSONpath !== 'string') {
    return {}
  }

  // extract token:
  let tokenJSONpath = data.options.tokenJSONpath
  let tokens = jp.query(ctx, tokenJSONpath)
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
const createOAuthHeader = (
  data: PreprocessingData,
  ctx: Object
) : {[string] : string} => {
  if (typeof data.options.tokenJSONpath !== 'string') {
    return {}
  }

  // extract token
  let tokenJSONpath = data.options.tokenJSONpath
  let tokens = jp.query(ctx, tokenJSONpath)
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
const getAuthOptions = (
  operation: Operation,
  _oasgraph: Object,
  data: PreprocessingData
) : AuthOptions => {
  let authHeaders = {}
  let authQs = {}

  // determine if authentication is required, and which protocol (if any) we
  // can use
  let {authRequired, protocolName} = getAuthReqAndProtcolName(
    operation, _oasgraph, data)

  // possibly, we don't need to do anything:
  if (!authRequired) {
    return {authHeaders, authQs}
  }

  // if authentication is required, but we can't fulfill the protocol, throw:
  if (authRequired && typeof protocolName !== 'string') {
    throw new Error(`Missing information to authenticate API request.`)
  }

  if (typeof protocolName === 'string') {
    let security = data.security[protocolName]
    switch (security.def.type) {
      case 'apiKey':
        let apiKey = _oasgraph.security[protocolName].apiKey
        if ('in' in security.def) {
          if (security.def.in === 'header' &&
            typeof security.def.name === 'string') {
            authHeaders[security.def.name] = apiKey
          } else if (security.def.in === 'query' &&
            typeof security.def.name === 'string') {
            authQs[security.def.name] = apiKey
          } else {
            if (data.strict) {
              throw new Error(`Cannot send apiKey in ` +
                `"${JSON.stringify(security.def.in)}"`)
            }
            log(`Warning: cannot send apiKey in ` +
              `"${JSON.stringify(security.def.in)}"`)
          }
        }
        break

      case 'http':
        switch (security.def.scheme) {
          case 'basic':
            let username = _oasgraph.security[protocolName].username
            let password = _oasgraph.security[protocolName].password
            authHeaders['Authorization'] = 'Basic ' +
              Buffer.from(username + ':' + password).toString('base64')
            break

          default:
            if (data.options.strict) {
              throw new Error(`Cannot recognize http security scheme ` +
                `'${JSON.stringify(security.def.scheme)}'`)
            }
            log(`Warning: cannot recognize http security scheme ` +
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

  return {authHeaders, authQs}
}

/**
 * Determines whether given operation requires authentication, and which of the
 * (possibly multiple) authentication protocols can be used based on the data
 * present in the given context.
 */
const getAuthReqAndProtcolName = (
  operation: Operation,
  _oasgraph,
  data: PreprocessingData
) : AuthReqAndProtcolName => {
  let authRequired = false
  if (Array.isArray(operation.securityRequirements) &&
    operation.securityRequirements.length > 0) {
    authRequired = true

    for (let securityRequirement of operation.securityRequirements) {
      if (securityRequirement in _oasgraph.security) {
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

module.exports = {
  getResolver
}

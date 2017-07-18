'use strict'

const request = require('request')
const Oas3Tools = require('./oas_3_tools.js')
const log = require('debug')('http')
const querystring = require('querystring')
const jp = require('jsonpath')

/**
 * Creates and returns a resolver function that performs API requests for the
 * given GraphQL query.
 *
 * @param  {Object} options.operation      Corresponding operation
 * @param  {Object} options.oas
 * @param  {Object} options.argsFromLink   Object containing the args for this
 * resolver provided through links
 * @param  {Array}  options.argsFromParent List of names of parameter provided
 * by parent operation - i.e., their arguments are present in ctx.usedParam
 * @param  {String} options.payloadName    Name of the argument to send as
 * request payload
 * @param  {Object} options.data           Data produced by preprocessor.js
 * @return {Function}                      Resolver function
 */
const getResolver = ({
  operation,
  oas,
  argsFromLink = {},
  argsFromParent = [],
  payloadName,
  data
}) => {
  // determine the appropriate URL:
  let baseUrl = Oas3Tools.getBaseUrl(oas, operation)

  // return resolve function:
  return (root, args, ctx = {}) => {
    // fetch possibly existing _oasgraph:
    let _oasgraph = {}
    if (root && typeof root === 'object' &&
      typeof root._oasgraph === 'object') {
      _oasgraph = root._oasgraph
    }
    if (typeof _oasgraph.usedParams === 'undefined') {
      _oasgraph.usedParams = {}
    }

    // handle arguments provided by links:
    if (typeof argsFromLink === 'object') {
      for (let key in argsFromLink) {
        args[key] = root[argsFromLink[key]]
      }
    }

    // handle arguments provided by parent - we reuse parameters populated in
    // previous calls from the context
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
    let options = {
      method: operation.method,
      url: url,
      json: true,
      headers: {},
      qs: query
    }

    // determine possible payload:
    // GraphQL produces sanitized payload names, so we have to sanitize before
    // lookup here:
    let sanePayloadName = Oas3Tools.beautify(payloadName)
    if (sanePayloadName in args) {
      // we need to desanitize the payload so the API understands it:
      let rawPayload = Oas3Tools.desanitizeObjKeys(
        args[sanePayloadName], data.saneMap)
      options.body = rawPayload
    }

    // use OASGraph options:
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

    // get authentication headers and query parameters:
    let {authHeaders, authQs} = getAuthOptions(operation, _oasgraph, data)

    // ...and pass them to the options:
    Object.assign(options.headers, authHeaders)
    Object.assign(options.qs, authQs)

    // extract OAuth token from context (if available):
    let oauthHeader = createOAuthHeader(data, ctx)
    Object.assign(options.headers, oauthHeader)

    // make the call:
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
          // deal with the fact that the server might send unsanitized data:
          let saneData = Oas3Tools.sanitizeObjKeys(body)

          // pass on _oasgraph to subsequent resolvers:
          if (typeof saneData === 'object') {
            saneData._oasgraph = _oasgraph
          }

          resolve(saneData)
        }
      })
    })
  }
}

/**
 * Attempts to create an OAuth authorization header by extracting an OAuth token
 * from the ctx based on the JSON path provided in the options.
 *
 * @param  {Object} data Data produced by preprocessing
 * @param  {Object} ctx  GraphQL context
 * @return {Object}      Object, possibly containing 'Authorization' header
 */
const createOAuthHeader = (data, ctx) => {
  if (typeof data.options.tokenJSONpath !== 'string') {
    return {}
  }

  // extract token:
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
 *
 * @param  {Object} operation Data from preprocessing about an operation
 * @param  {Object} _oasgraph Data populated by parent resolvers, contains
 * security object
 * @param  {Object} data      Result from preprocessing
 * @return {Object}           Object containing authHeader and authQs object,
 * which hold headers and query parameters respectively to authentication a
 * request.
 */
const getAuthOptions = (operation, _oasgraph, data) => {
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

  let security = data.security[protocolName]
  switch (security.def.type) {
    case 'apiKey':
      let apiKey = _oasgraph.security[protocolName].apiKey
      if ('in' in security.def) {
        if (security.def.in === 'header') {
          authHeaders[security.def.name] = apiKey
        } else if (security.def.in === 'query') {
          authQs[security.def.name] = apiKey
        } else {
          if (data.strict) {
            throw new Error(`Cannot send apiKey in ${security.def.in}`)
          }
          log(`Warning: cannot send apiKey in ${security.def.in}`)
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
              `'${security.def.scheme}'`)
          }
          log(`Warning: cannot recognize http security scheme ` +
            `'${security.def.scheme}'`)
      }
      break

    case 'oauth2':
      break

    case 'openIdConnect':
      break

    default:
      throw new Error(`Cannot recognize security type '${security.def.type}'`)
  }

  return {authHeaders, authQs}
}

/**
 * Determines whether given operation requires authentication, and which of the
 * (possibly multiple) authentication protocols can be used based on the data
 * present in the given context.
 *
 * @param  {Object} operation Data from preprocessing about an operation
 * @param  {Object} _oasgraph Data populated by parent resolvers, contains
 * security object
 * @param  {Object} data      Result from preprocessing
 * @return {Object}           Contains boolean authRequired and string
 * protocolName fields
 */
const getAuthReqAndProtcolName = (operation, _oasgraph, data) => {
  let authRequired = false

  if (typeof operation.securityProtocols === 'object' &&
    Object.keys(operation.securityProtocols).length > 0) {
    authRequired = true

    for (let protocolIndex in operation.securityProtocols) {
      for (let protocolName in operation.securityProtocols[protocolIndex]) {
        if (protocolName in _oasgraph.security) {
          return {
            authRequired,
            protocolName
          }
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

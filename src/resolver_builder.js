'use strict'

const request = require('request')
const Oas3Tools = require('./oas_3_tools.js')

/**
 * Creates and returns a resolver function that performs API requests for the
 * given GraphQL query.
 *
 * @param  {string} options.path         Path to invoke
 * @param  {string} options.method       Method to invoke
 * @param  {object} options.oas
 * @param  {object} options.argsFromLink Object containing the args for this
 * resolver provided through links
 * @param  {string} options.payloadName  Name of the argument to send as request
 * payload
 * @param  {object} options.data         Data produced by preprocessor.js
 * @return {function}                    Resolver function
 */
const getResolver = ({
  operation,
  oas,
  argsFromLink = {},
  payloadName,
  data
}) => {
  // determine the base URL:
  let baseUrl = Oas3Tools.getBaseUrl(oas)

  // return resolve function:
  return (root, args, ctx) => {
    // handle arguments provided by links:
    if (typeof argsFromLink === 'object') {
      for (let key in argsFromLink) {
        args[key] = root[argsFromLink[key]]
      }
    }

    // build URL (i.e., fill in path parameters):
    let {path, query} = Oas3Tools.instantiatePathAndGetQuery(
      operation.path,
      operation.parameters,
      args)
    let url = baseUrl + path
    // console.log(query)
    // build request options:
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

    // do security:
    let {securityRequired, protocol} = getProtocol(operation, ctx, data)

    // console.log(`securityRequired: ${securityRequired}`)
    // console.log('security')
    // console.log(data.security)
    // console.log('protocol')
    // console.log(protocol)
    // console.log('ctx security')
    // console.log(ctx.security)

    if (securityRequired) {
      let security = data.security[protocol]
      switch (security.def.type) {
        case 'apiKey':
          let apiKey = ctx.security[security.parameters.apiKey]
          if (typeof apiKey === 'string') {
            if ('in' in security.def) {
              if (security.def.in === 'header') {
                options.headers[security.def.name] = ctx.security[security.parameters.apiKey]
              } else if (security.def.in === 'query') {
                options.qs[security.def.name] = ctx.security[security.parameters.apiKey]
              } else {
                let error = new Error(`Cannot send apiKey in ${security.def.in}`)
                console.error(error)
                throw error
              }
            }
          } else {
            let error = new Error(`API key '${apiKey}' is not a String`)
            console.error(error)
            throw error
          }
          break

        case 'http':
          switch (security.def.scheme) {
            case 'basic':
              let username = ctx.security[security.parameters.username]
              // console.log('security parameters')
              // console.log(security.parameters)
              let password = ctx.security[security.parameters.password]
              // console.log(`username: ${username}`)
              // console.log(`password: ${password}`)
              if (typeof username === 'string' && typeof password === 'string') {
                options.headers['Authorization'] = 'Basic ' + new Buffer(username + ':' + password).toString('base64')
                // console.log(`headers: ${options.headers['Authorization']}`)
              } else {
                let error = new Error(`Username '${username}' and password are not Strings`)
                console.error(error)
                throw error
              }
              break

            default:
              let error = new Error(`Cannot recognize http security scheme '${security.def.scheme}'`)
              console.error(error)
              throw error
          }
          // var username = 'username',
          // password = 'password',
          // url = 'http://' + username + ':' + password + '@some.server.com';
          break

        case 'oauth2':
          break

        case 'openIdConnect':
          break

        default:
          let error = new Error(`Cannot recognize security type '${security.def.type}'`)
          console.error(error)
          throw error
      }
    }

    // make the call:
    console.log(`${options.method.toUpperCase()} ${options.url}`)
    return new Promise((resolve, reject) => {
      request(options, (err, response, body) => {
        if (err) {
          console.error(err)
          reject(err)
        } else if (response.statusCode > 299) {
          console.error(`${response.statusCode} - ${JSON.stringify(body)}`)
          reject(new Error(`${response.statusCode} - ${JSON.stringify(body)}`))
        } else {
          console.log(response.statusCode)
          // deal with the fact that the server might send unsanitized data:
          let saneData = Oas3Tools.sanitizeObjKeys(body)
          resolve(saneData)
        }
      })
    })
  }
}

const getProtocol = (operation, ctx, data) => {
  let result = {}

  if (typeof operation.securityProtocols === 'object' && Object.keys(operation.securityProtocols).length > 0) {
    result.securityRequired = true
    for (let protocolIndex in operation.securityProtocols) {
      for (let protocol in operation.securityProtocols[protocolIndex]) {
        if ((function () {
          for (let parameter in data.security[protocol].parameters) {
            // let beautifiedParameter = data.security[protocol].parameters[parameter]
            // console.log('parameter')
            // console.log(parameter)
            //
            // console.log('beautifiedParameter')
            // console.log(beautifiedParameter)
            //
            // console.log(ctx.security)
            // // console.log(data.security[protocol].parameters[parameter])
            // // console.log(ctx.security)
            if (!(data.security[protocol].parameters[parameter] in ctx.security)) {
              return false
            }
          }
          result.protocol = protocol
          return true
        })()) {
          return result
        }
      }
    }
  } else {
    result.securityRequired = false
  }
  return result
}

module.exports = {
  getResolver
}

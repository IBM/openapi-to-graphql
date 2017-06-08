'use strict'

const request = require('request')
const Oas3Tools = require('./oas_3_tools.js')

/**
 * Generates and returns a resolver that performs API requests to obtain data
 * with the schema of the given key.
 *
 * @param  {string} path         Path of the endpoint to create resolver for
 * @param  {string} method       Method of the endpoint to create resolver for
 * @param  {object} endpoint     Endpoint to create resolver for
 * @param  {object} oas          The original OAS
 * @param  {object} argsFromLink Object containing the args for this resolver
 * provided through links
 * @return {function}            Resolver function
 */
const getResolver = (path, method, endpoint, oas, argsFromLink, payloadName) => {
  let baseUrl = Oas3Tools.getBaseUrl(oas)

  return (root, args, ctx) => {
    // handle arguments provided by links:
    if (typeof argsFromLink === 'object') {
      for (let key in argsFromLink) {
        args[key] = root[argsFromLink[key]]
      }
    }

    // build URL (i.e., fill in path parameters):
    let urlPath = Oas3Tools.instantiatePath(path, endpoint, args)
    let url = baseUrl + urlPath

    // build request options:
    let options = {
      method: method,
      url: url,
      json: true
    }

    // determine possible payload:
    if (payloadName in args) {
      options.body = args[payloadName]
    }

    return new Promise((resolve, reject) => {
      request(options, (err, response, data) => {
        if (err) {
          reject(err)
        } else {
          resolve(data)
        }
      })
    })
  }
}

module.exports = {
  getResolver: getResolver
}

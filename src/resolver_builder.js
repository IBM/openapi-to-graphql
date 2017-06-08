'use strict'

const request = require('request')
const Oas3Tools = require('./oas_3_tools.js')

/**
 * Creates and returns a resolver function that performs API requests for the
 * given GraphQL query.
 *
 * @param  {string} options.path         Path to invoke
 * @param  {string} options.method       Method to invoke
 * @param  {object} options.endpoint     Endpoint for request to make
 * @param  {object} options.oas
 * @param  {object} options.argsFromLink Object containing the args for this
 * resolver provided through links
 * @param  {string} options.payloadName  Name of the argument to send as request
 * payload
 * @return {function}                    Resolver function
 */
const getResolver = ({
  path,
  method,
  endpoint,
  oas,
  argsFromLink = {},
  payloadName
}) => {
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

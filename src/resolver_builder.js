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
 * @return {function}                    Resolver function
 */
const getResolver = ({
  operation,
  oas,
  argsFromLink = {},
  payloadName
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
    let urlPath = Oas3Tools.instantiatePathAndQuery(
      operation.path,
      operation.parameters,
      args)
    let url = baseUrl + urlPath

    // build request options:
    let options = {
      method: operation.method,
      url: url,
      json: true
    }

    // determine possible payload:
    if (payloadName in args) {
      options.body = args[payloadName]
    }
    console.log(`${options.method.toUpperCase()} ${options.url}`)
    return new Promise((resolve, reject) => {
      request(options, (err, response, data) => {
        if (err) {
          console.error(err)
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

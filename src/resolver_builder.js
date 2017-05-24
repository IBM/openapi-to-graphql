'use strict'

const request = require('request')
const Oas3Tools = require('./oas_3_tools.js')

/**
 * Generates and returns a resolver that performs API requests to obtain data
 * with the schema of the given key.
 */
const getResolver = (path, method, endpoint, oas, argsFromLink) => {
  let baseUrl = Oas3Tools.getBaseUrl(oas)

  return (root, args, ctx) => {
    // handle arguments provided by links:
    if (typeof argsFromLink === 'object') {
      for (let key in argsFromLink) {
        args[key] = root[argsFromLink[key]]
      }
    }

    let urlPath = Oas3Tools.instantiatePath(path, endpoint, args)
    let url = baseUrl + urlPath
    console.log(url)
    return new Promise((resolve, reject) => {
      request({
        method: method,
        url: url,
        json: true
      }, (err, response, data) => {
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

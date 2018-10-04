#!/usr/bin/env node

// Copyright IBM Corp. 2017,2018. All Rights Reserved.
// Node module: oasgraph
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

const express = require('express')
const graphqlHTTP = require('express-graphql')
const OasGraph = require('./lib/index.js')
const path = require('path')
const request = require('request')
const fs = require('fs')

const app = express()

if (process.argv.length <= 2) {
  const usage = ' <OAS JSON file path or remote url> [port number]'
  console.log('Usage: ' + __filename + usage)
  process.exit(-1)
}

let filePath = process.argv[2]
let portNumber = process.argv[3] ? process.argv[3] : 3001

// check if the file exists 
if (fs.existsSync(path.resolve(filePath))) {
  let oas = JSON.stringify(require(path.resolve(filePath)))
  startGraphQLServer(oas, portNumber)
    
} else { // falls back to a remote location
  if (filePath.match(/^https?/g)) {
    getRemoteFileSpec(filePath).then(remoteContent=> {
    startGraphQLServer(remoteContent, portNumber)
  })
  } else {
    console.log(`OASGraph reading local file error. file ${filePath} does not exist.`)
    } 
}

/**
 * reads a remote file content using http protocol
 * @param {string} url specifies a valid URL path including the port number
 */
function getRemoteFileSpec (uri) {
  return new Promise((resolve, reject) => {
    request({
      uri,
      json: true
    }, (err, res, body) => {
      if (err) {
        reject(err)
      } else if (res.statusCode !== 200) {
        reject(new Error(`Error: ${JSON.stringify(body)}`))
      } else {
        resolve(body)
      }
    })
  })
}

/**
 * generates a GraphQL schema and starts the GraphQL server on the specified port 
 * @param {Object} oas the OAS specification file
 * @param {number} thePort the port number to listen on on this server
 */
function startGraphQLServer(oas, thePort) {
  // Create GraphQL interface
  OasGraph.createGraphQlSchema(oas) 
     .then(({schema, report}) => {
      console.log(JSON.stringify(report, null, 2))

      // mounting graphql endpoint using the middleware express-graphql
      app.use('/graphql', graphqlHTTP({
        schema: schema,
        graphiql: true
      }))

      // initiating the server on the port specified by user or the default one
      app.listen(thePort, () => {
        console.log(`GraphQL accessible at: http://localhost:${thePort}/graphql`)
      })
    })
    .catch(err => {
       console.log('OASGraph creation event error: ', err.message)
     })
}

#!/usr/bin/env node

// Copyright IBM Corp. 2017,2018. All Rights Reserved.
// Node module: oasgraph
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

const express = require('express')
const graphqlHTTP = require('express-graphql')
const OasGraph = require('./lib/index.js')
const path = require('path')

const app = express()
const [,, ... args] = process.argv

// Check for arguments
if (args.length > 0) {
  let filePath = args[0]

  // Convert path to absolute path
  // Otherwise, would need to have separate cases for relative or absolute paths
  filePath = path.resolve(filePath)

  try {
    let oas = require(filePath)

    // Create GraphQL interface
    OasGraph.createGraphQlSchema(oas)
      .then(({schema, report}) => {
        console.log(JSON.stringify(report, null, 2))
        app.use('/graphql', graphqlHTTP({
          schema: schema,
          graphiql: true
        }))

        app.listen(3001, () => {
          console.log('GraphQL accessible at: http://localhost:3001/graphql')
        })
      })
      .catch(err => {
        console.log(err)
      })
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.log(`The file path "${filePath}" is invalid.`)
    } else {
      console.log(error)
    }
  }
} else {
  console.log(
    'Usage: oasgraph <OAS JSON file path>'
  )
}

'use strict'

// enable logging:
process.env.DEBUG = 'translation,http'

const express = require('express')
const graphqlHTTP = require('express-graphql')
const app = express()
const OasGraph = require('../lib/index.js')
const path = require('path')
const log = require('debug')('translation')

const startServer = (oas) => {
  OasGraph.createGraphQlSchema(oas)
    .then(({schema}) => {
      app.use('/graphql', graphqlHTTP({
        schema: schema,
        graphiql: true
      }))

      app.listen(3001, () => {
        log('GraphQL accessible at: http://localhost:3001/graphql')
      })
    })
    .catch(err => {
      console.log(err)
    })
}

// ensure path to OAS is provided:
if (process.argv.length <= 2) {
  console.error(`Please provide path to OAS as a parameter - aborting...`)
  process.exit(-1)
}

// go:
let inputPath = process.argv[2]
try {
  let oas = require(path.resolve(inputPath))
  startServer(oas)
} catch (e) {
  console.error(e)
}

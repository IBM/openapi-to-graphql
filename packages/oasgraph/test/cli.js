// Copyright IBM Corp. 2017,2018. All Rights Reserved.
// Node module: oasgraph
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

// enable logging:
process.env.DEBUG = 'translation,http'

const express = require('express')
const graphqlHTTP = require('express-graphql')
const app = express()
const OasGraph = require('../lib/index.js')
const path = require('path')
const log = require('debug')('translation')
const YAML = require('js-yaml')
const fs = require('fs')

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

/**
* Returns content of read JSON/YAML file.
*
* @param  {String} path Path to file to read
* @return {Object}      Content of read file
*/
function readFile (path) {
  try {
    let doc
    if (/json$/.test(path)) {
      doc = JSON.parse(fs.readFileSync(path, 'utf8'))
    } else if (/yaml$|yml$/.test(path)) {
      doc = YAML.safeLoad(fs.readFileSync(path, 'utf8'))
    }
    return doc
  } catch (e) {
    console.error('Error: failed to parse YAML/JSON: ' + e)
    return null
  }
}

// ensure path to OAS is provided:
if (process.argv.length <= 2) {
  console.error(`Please provide path to OAS as a parameter - aborting...`)
  process.exit(-1)
}

// go:
let inputPath = process.argv[2]
try {
  let oas = readFile(path.resolve(inputPath))
  startServer(oas)
} catch (e) {
  console.error(e)
}

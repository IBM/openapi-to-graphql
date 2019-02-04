#!/usr/bin/env node

import * as express from 'express'
import * as graphqlHTTP from 'express-graphql'
import { createGraphQlSchema } from 'oasgraph'
import * as path from 'path'
import * as request from 'request'
import * as fs from 'fs'
import * as yaml from 'js-yaml'
import { printSchema } from 'graphql'

var program = require('commander')

const app = express()

let filePath
let portNumber: number | string = 3001

program
  .version(require('../package.json').version)
  .usage('<OAS JSON file path or remote url> [options]')
  .arguments('<path>')
  .option('-p, --port <port>', 'select the port where the server will start', parseInt)
  .option('-u, --url <url>', 'select the base url which paths will be built on')
  .option('-s, --strict', 'throw an error if OASGraph cannot run without compensating for errors or missing data in the OAS')
  .option('-a, --addSubOperations', 'nest operations based on path hierarchy')
  .option('-f, --fillEmptyResponses', 'create placeholder schemas for operations with HTTP status code 204 (no response) rather than ignore them')
  .option('--no-viewer', 'do not create GraphQL viewer objects for passing authentication credentials')
  .option('--save <file path>', 'save schema to path and do not start server')
  .action(function (path) {
     filePath = path
  })
  .parse(process.argv)

if (typeof filePath === 'undefined') {
   console.error('No path provided')
   console.error('Please refer to the help manual (oasgraph -h) for more information')
   process.exit(1);
}

if (program.port) {
  portNumber = program.port
}

// check if the file exists 
if (fs.existsSync(path.resolve(filePath))) {
  try {
    let oas = readFile(path.resolve(filePath))
    startGraphQLServer(oas, portNumber)
  } catch (e) {
    console.error(e)
  }
  
} else { 
  // falls back to a remote location
  if (filePath.match(/^https?/g)) {
    getRemoteFileSpec(filePath).then(remoteContent=> {
    startGraphQLServer(remoteContent, portNumber)
  })
  } else {
    console.error(`OASGraph reading local file error. File ${filePath} does not exist.`)
  }
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
      doc = yaml.safeLoad(fs.readFileSync(path, 'utf8'))
    }
    return doc
  } catch (e) {
    console.error('Error: failed to parse YAML/JSON: ' + e)
    return null
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
 * @param {number} port the port number to listen on on this server
 */
function startGraphQLServer(oas, port) {
  // Create GraphQL interface
  createGraphQlSchema(oas, {
    strict: program.strict,
    viewer: program.viewer,
    addSubOperations: program.addSubOperations,
    fillEmptyResponses: program.fillEmptyResponses,
    baseUrl: program.url
  }) 
     .then(({schema, report}) => {
      console.log(JSON.stringify(report, null, 2))

      // save local file if required 
      if (program.save) {
        writeSchema(schema);
      } else {
        // mounting graphql endpoint using the middleware express-graphql
        app.use('/graphql', graphqlHTTP({
          schema: schema,
          graphiql: true
        }))

        // initiating the server on the port specified by user or the default one
        app.listen(port, () => {
          console.log(`GraphQL accessible at: http://localhost:${port}/graphql`)
        })
      }
    })
    .catch(err => {
       console.log('OASGraph creation event error: ', err.message)
     })
}

/**
 * saves a grahpQL schema generated by OASGraph to a file
 * @param {createGraphQlSchema} schema 
 */
function writeSchema(schema){
  fs.writeFile(program.save, printSchema(schema), (err) => {
    if (err) throw err
    console.log(`OASGraph successfully saved your schema at ${program.save}`)
  })
}
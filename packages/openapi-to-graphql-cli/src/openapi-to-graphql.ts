#!/usr/bin/env node

import * as express from 'express'
import * as graphqlHTTP from 'express-graphql'
import * as cors from 'cors'
import * as path from 'path'
import * as request from 'request'
import * as fs from 'fs'
import * as yaml from 'js-yaml'
import { printSchema } from 'graphql'

import { createGraphQlSchema } from 'openapi-to-graphql'

const app = express()
let program = require('commander')

program
  .version(require('../package.json').version)
  .usage('<OAS JSON file path(s) and/or remote url(s)> [options]')
  .arguments('<path(s) and/or url(s)>')
  .option(
    '-p, --port <port>',
    'select the port where the server will start',
    parseInt
  )
  .option('-u, --url <url>', 'select the base url which paths will be built on')
  .option(
    '-s, --strict',
    'throw an error if OpenAPI-to-GraphQL cannot run without compensating for errors or missing data in the OAS'
  )
  .option(
    '-f, --fillEmptyResponses',
    'create placeholder schemas for operations with no response body rather than ignore them'
  )
  .option(
    '-a, --addLimitArgument',
    'add a limit argument on fields returning lists of objects/lists to control the data size'
  )
  .option(
    '-o, --operationIdFieldNames',
    'create field names based on the operationId'
  )
  .option('--cors', 'enable Cross-origin resource sharing (CORS)')
  .option(
    '--no-viewer',
    'do not create GraphQL viewer objects for passing authentication credentials'
  )
  .option(
    '--no-extensions',
    'do not add extentions, containing information about failed REST calls, to the GraphQL errors objects'
  )
  .option(
    '--no-equivalentToMessages',
    'do not append information about the underlying REST operations to the description of fields'
  )
  .option('--save <file path>', 'save schema to path and do not start server')
  .parse(process.argv)

// Select the port on which to host the GraphQL server
const portNumber: number | string = program.port ? program.port : 3000

const filePaths = program.args

if (typeof filePaths === 'undefined' || filePaths.length === 0) {
  console.error('No path(s) provided')
  console.error(
    'Please refer to the help manual (openapi-to-graphql -h) for more information'
  )
  process.exit(1)
}

// Load the OASs based off of the provided paths
Promise.all(
  filePaths.map(filePath => {
    return new Promise((resolve, reject) => {
      // Check if the file exists
      if (fs.existsSync(path.resolve(filePath))) {
        try {
          resolve(readFile(path.resolve(filePath)))
        } catch (error) {
          console.error(error)
          reject(filePath)
        }

        // Check if file is in a remote location
      } else if (filePath.match(/^https?/g)) {
        getRemoteFileSpec(filePath)
          .then(remoteContent => {
            resolve(remoteContent)
          })
          .catch(error => {
            console.error(error)
            reject(filePath)
          })

        // Cannot determine location of file
      } else {
        reject(filePath)
      }
    })
  })
)
  .then(oass => {
    startGraphQLServer(oass, portNumber)
  })
  .catch(filePath => {
    console.error(
      `OpenAPI-to-GraphQL cannot read file. File '${filePath}' does not exist.`
    )
    process.exit(1)
  })

/**
 * Returns content of read JSON/YAML file.
 *
 * @param  {string} path Path to file to read
 * @return {object}      Content of read file
 */
function readFile(path) {
  try {
    const doc = /json$/.test(path)
      ? JSON.parse(fs.readFileSync(path, 'utf8'))
      : yaml.safeLoad(fs.readFileSync(path, 'utf8'))
    return doc
  } catch (e) {
    console.error('Error: failed to parse YAML/JSON')
    return null
  }
}

/**
 * reads a remote file content using http protocol
 * @param {string} url specifies a valid URL path including the port number
 */
function getRemoteFileSpec(uri) {
  return new Promise((resolve, reject) => {
    request(
      {
        uri,
        json: true
      },
      (err, res, body) => {
        if (err) {
          reject(err)
        } else if (res.statusCode !== 200) {
          reject(new Error(`Error: ${JSON.stringify(body)}`))
        } else {
          resolve(body)
        }
      }
    )
  })
}

/**
 * generates a GraphQL schema and starts the GraphQL server on the specified port
 * @param {object} oas the OAS specification file
 * @param {number} port the port number to listen on on this server
 */
function startGraphQLServer(oas, port) {
  // Create GraphQL interface
  createGraphQlSchema(oas, {
    strict: program.strict,
    viewer: program.viewer,
    fillEmptyResponses: program.fillEmptyResponses,
    baseUrl: program.url,
    operationIdFieldNames: program.operationIdFieldNames,
    provideErrorExtensions: program.extensions,
    addLimitArgument: program.addLimitArgument,
    equivalentToMessages: program.equivalentToMessages
  })
    .then(({ schema, report }) => {
      console.log(JSON.stringify(report, null, 2))

      // Save local file if required
      if (program.save) {
        writeSchema(schema)
      } else {
        // Enable CORS
        if (program.cors) {
          app.use(cors())
        }

        // Mounting graphql endpoint using the middleware express-graphql
        app.use(
          '/graphql',
          graphqlHTTP({
            schema: schema,
            graphiql: true
          })
        )

        // Initiating the server on the port specified by user or the default one
        app.listen(port, () => {
          console.log(`GraphQL accessible at: http://localhost:${port}/graphql`)
        })
      }
    })
    .catch(err => {
      console.log('OpenAPI-to-GraphQL creation event error: ', err.message)
    })
}

/**
 * saves a grahpQL schema generated by OpenAPI-to-GraphQL to a file
 * @param {createGraphQlSchema} schema
 */
function writeSchema(schema) {
  fs.writeFile(program.save, printSchema(schema), err => {
    if (err) throw err
    console.log(
      `OpenAPI-to-GraphQL successfully saved your schema at ${program.save}`
    )
  })
}

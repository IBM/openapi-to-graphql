// Copyright IBM Corp. 2017,2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

let server // holds server object for shutdown

/**
 * Starts the server at the given port
 */
function startServer(PORT) {
  const express = require('express')
  const app = express()

  const bodyParser = require('body-parser')
  app.use(bodyParser.json())

  app.post('/v1/files', (req, res) => {
    console.log(req.method, req.path)
    res.send({
      type: 'TEST_ENUM'
    })
  })

  return new Promise(resolve => {
    server = app.listen(PORT, () => {
      console.log(`Simple oas2 API accessible on port ${PORT}`)
      resolve()
    })
  })
}

/**
 * Stops server.
 */
function stopServer() {
  return new Promise(resolve => {
    server.close(() => {
      console.log(`Stopped API server`)
      resolve()
    })
  })
}

// if run from command line, start server:
if (require.main === module) {
  startServer(3007)
}

module.exports = {
  startServer,
  stopServer
}

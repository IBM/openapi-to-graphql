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
  app.use(bodyParser.urlencoded({ extended: true }))

  app.get('/api/object', (req, res) => {
    console.log(req.method, req.path)
    res.send({
      data: 'object'
    })
  })

  app.get('/api/object2', (req, res) => {
    console.log(req.method, req.path)
    if (typeof req.headers.specialheader === 'string') {
      res.send({
        data: `object2 with special header: '${req.headers.specialheader}'`
      })
    } else {
      res.send({
        data: 'object2'
      })
    }
  })

  app.post('/api/formUrlEncoded', (req, res) => {
    console.log(req.method, req.path)
    res.send(req.body)
  })

  app.get('/api/cars/:id', (req, res) => {
    console.log(req.method, req.path)
    res.send(`Car ID: ${req.params.id}`)
  })

  app.get('/api/cacti/:cactusId', (req, res) => {
    console.log(req.method, req.path)
    res.send(`Cactus ID: ${req.params.cactusId}`)
  })

  app.get(
    '/api/eateries/:eatery/breads/:breadName/dishes/:dishKey',
    (req, res) => {
      console.log(req.method, req.path)
      res.send(
        `Parameters combined: ${req.params.eatery} ${req.params.breadName} ${req.params.dishKey}`
      )
    }
  )

  return new Promise(resolve => {
    server = app.listen(PORT, () => {
      console.log(`Example API accessible on port ${PORT}`)
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

// If run from command line, start server:
if (require.main === module) {
  startServer(3006)
}

module.exports = {
  startServer,
  stopServer
}

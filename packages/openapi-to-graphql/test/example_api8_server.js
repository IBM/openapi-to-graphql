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
  app.use(bodyParser.text())
  app.use(bodyParser.json())

  const Types = {
    author: {
      baseAttribute: 'authorBaseAttributeValue',
      kind: 'FIRST_DERIVED_TYPE',
      firstDerivedTypeAttribute: 1,
      name: 'author'
    },
    book: {
      baseAttribute: 'bookBaseAttributeValue',
      kind: 'SECOND_DERIVED_TYPE',
      secondDerivedTypeAttribute: 'listOfBooks',
      name: 'book'
    }
  }

  app.get('/api/type/:typeName', (req, res) => {
    res.send(Types[req.params.typeName])
  })

  app.get('/api/types', (req, res) => {
    const t = []
    for (const typeName in Types) {
      t.push(Types[typeName])
    }

    res.send(t)
  })

  app.get('/api/firstDerivedType', (req, res) => {
    res.send(Types['author'])
  })

  app.get('/api/secondDerivedType', (req, res) => {
    res.send(Types['book'])
  })

  app.get('/api/oneOfDerivedTypes/:typeName', (req, res) => {
    res.send(Types[req.params.typeName])
  })

  app.post('/api/type', (req, res) => {
    if (
      req.body &&
      req.body.type &&
      req.body.type.name &&
      !Types[req.body.type.name]
    ) {
      Types[req.body.type.name] = req.body.type
    }

    res.send({
      data: req.body.baseTypeCommandAttribute
        ? req.body.baseTypeCommandAttribute
        : 'created'
    })
  })

  return new Promise((resolve) => {
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
  return new Promise((resolve) => {
    server.close(() => {
      console.log(`Stopped API server`)
      resolve()
    })
  })
}

// If run from command line, start server:
if (require.main === module) {
  startServer(3003)
}

module.exports = {
  startServer,
  stopServer
}

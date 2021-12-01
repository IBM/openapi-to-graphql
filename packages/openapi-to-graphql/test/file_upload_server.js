'use strict'

const express = require('express')

let server // holds server object for shutdown

/**
 * Starts the server at the given port
 */
function startServer (PORT) {
  const app = express()

  const bodyParser = require('body-parser')
  app.use(bodyParser.json())

  app.get('/api/upload', (req, res) => {
    res.send({
      id: '1234567098',
      url: 'https://some-random-url.domain/assets/upload-file.ext'
    })
  })

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
function stopServer () {
  return new Promise(resolve => {
    server.close(() => {
      console.log(`Stopped API server`)
      resolve()
    })
  })
}

// If run from command line, start server:
if (require.main === module) {
  void (async () => startServer(3002))()
}

module.exports = {
  startServer,
  stopServer
}

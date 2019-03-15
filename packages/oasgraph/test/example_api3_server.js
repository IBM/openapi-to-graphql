// Copyright IBM Corp. 2017,2018. All Rights Reserved.
// Node module: oasgraph
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

let server // holds server object for shutdown

/**
 * Starts the server at the given port
 */
function startServer (PORT) {
  const express = require('express')
  const app = express()

  const bodyParser = require('body-parser')
  app.use(bodyParser.text())
  app.use(bodyParser.json())

  const Authors = {
    arlene: {
      name: 'Arlene L McMahon',
      masterpieceTitle: 'software'
      // address: {
      //   street: '4656 Cherry Camp Road',
      //   city: 'Elk Grove Village'
      // },
      // employerId: 'binsol',
      // hobbies: ['tap dancing', 'bowling'],
      // status: 'staff',
      // nomenclature: {
      //   suborder: 'Haplorhini',
      //   family: 'Hominidae',
      //   genus: 'Homo',
      //   species: 'sapiens'
      // }
    },
    will: {
      name: 'William B Ropp',
      masterpieceTitle: ''
      // address: {
      //   street: '3180 Little Acres Lane',
      //   city: 'Macomb'
      // },
      // employerId: 'binsol',
      // hobbies: ['tap dancing', 'baseball'],
      // status: 'staff',
      // nomenclature: {
      //   suborder: 'Haplorhini',
      //   family: 'Hominidae',
      //   genus: 'Homo',
      //   species: 'sapiens'
      // }
    },
    johnny: {
      name: 'John C Barnes',
      masterpieceTitle: ''
      // address: {
      //   street: '372 Elk Rd Little',
      //   city: 'Tucson'
      // },
      // employerId: 'binsol',
      // hobbies: ['chess', 'tennis'],
      // status: 'staff',
      // nomenclature: {
      //   suborder: 'Haplorhini',
      //   family: 'Hominidae',
      //   genus: 'Homo',
      //   species: 'sapiens'
      // }
    },
    heather: {
      name: 'Heather J Tate',
      masterpieceTitle: ''
      // address: {
      //   street: '3636 Poplar Chase Lane',
      //   city: 'Post Falls'
      // },
      // employerId: 'ccc',
      // hobbies: ['making money', 'counting money'],
      // status: 'alumni',
      // nomenclature: {
      //   suborder: 'Haplorhini',
      //   family: 'Hominidae',
      //   genus: 'Homo',
      //   species: 'ihavelotsofmoneyus'
      // }
    }
  }

  const Books = {
    software: {
      title: 'The OASGraph Cookbook',
      authorName: 'arlene'
    },
    frog: {
      title: 'One Frog, Two Frog, Red Frog, Blue Frog',
      authorName: 'will'
    },
    history: {
      title: 'A history on history',
      authorName: 'will'
    }
  }

  const NextWorks = {
    arlene: {
      title: 'OASGraph for Power Users',
      authorName: 'arlene'
    },
    johnny: {
      title: 'A one, a two, a one two three four!',
      authorName: 'johnny'
    },
    heather: {
      title: 'What did the baby computer say to the father computer? Data.',
      authorName: 'heather'
    }
  }

  const Auth = {
    arlene: {
      username: 'arlene123',
      password: 'password123',
      accessToken: 'abcdef'
    },
    will: {
      username: 'catloverxoxo',
      password: 'IActuallyPreferDogs',
      accessToken: '123456'
    },
    johnny: {
      username: 'johnny',
      password: 'password',
      accessToken: 'xyz'
    },
    heather: {
      username: 'cccrulez',
      password: 'johnnyisabully',
      accessToken: 'ijk'
    }
  }

  const authMiddleware = (req, res, next) => {
    if (req.headers.authorization) {
      let encoded = req.headers.authorization.split(' ')[1]
      let decoded = new Buffer(encoded, 'base64').toString('utf8').split(':')

      if (decoded.length === 2) {
        let credentials = {
          username: decoded[0],
          password: decoded[1]
        }
        for (let user in Auth) {
          if (Auth[user].username === credentials.username && Auth[user].password === credentials.password) {
            return next()
          }
        }
        res.status(401).send({
          message: 'Incorrect credentials'
        })
      } else {
        res.status(401).send({
          message: 'Basic Auth expects a single username and a single password'
        })
      }
    } else if ('access_token' in req.headers) {
      for (let user in Auth) {
        if (Auth[user].accessToken === req.headers.access_token) {
          return next()
        }
      }
      res.status(401).send({
        message: 'Incorrect credentials'
      })
      return false
    } else if ('access_token' in req.query) {
      for (let user in Auth) {
        if (Auth[user].accessToken === req.query.access_token) {
          return next()
        }
      }
      res.status(401).send({
        message: 'Incorrect credentials'
      })
    } else {
      res.status(401).send({
        message: 'Unknown/missing credentials'
      })
    }
  }

  app.get('/api/authors/:authorId', (req, res) => {
    console.log(req.method, req.path)
    res.send(Authors[req.params.authorId])
  })

  app.get('/api/books/:bookId', (req, res) => {
    console.log(req.method, req.path)
    res.send(Books[req.params.bookId])
  })

  app.get('/api/nextWorks/:authorId', authMiddleware, (req, res) => {
    console.log(req.method, req.path)
    res.send(NextWorks[req.params.authorId])
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

// if run from command line, start server:
if (require.main === module) {
  startServer(3003)
}

module.exports = {
  startServer,
  stopServer
}

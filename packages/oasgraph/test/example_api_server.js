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

  const Users = {
    arlene: {
      name: 'Arlene L McMahon',
      address: {
        street: '4656 Cherry Camp Road',
        city: 'Elk Grove Village'
      },
      employerId: 'binsol',
      hobbies: ['tap dancing', 'bowling'],
      status: 'staff',
      nomenclature: {
        suborder: 'Haplorhini',
        family: 'Hominidae',
        genus: 'Homo',
        species: 'sapiens'
      }
    },
    will: {
      name: 'William B Ropp',
      address: {
        street: '3180 Little Acres Lane',
        city: 'Macomb'
      },
      employerId: 'binsol',
      hobbies: ['tap dancing', 'baseball'],
      status: 'staff',
      nomenclature: {
        suborder: 'Haplorhini',
        family: 'Hominidae',
        genus: 'Homo',
        species: 'sapiens'
      }
    },
    johnny: {
      name: 'John C Barnes',
      address: {
        street: '372 Elk Rd Little',
        city: 'Tucson'
      },
      employerId: 'binsol',
      hobbies: ['chess', 'tennis'],
      status: 'staff',
      nomenclature: {
        suborder: 'Haplorhini',
        family: 'Hominidae',
        genus: 'Homo',
        species: 'sapiens'
      }
    },
    heather: {
      name: 'Heather J Tate',
      address: {
        street: '3636 Poplar Chase Lane',
        city: 'Post Falls'
      },
      employerId: 'ccc',
      hobbies: ['making money', 'counting money'],
      status: 'alumni',
      nomenclature: {
        suborder: 'Haplorhini',
        family: 'Hominidae',
        genus: 'Homo',
        species: 'ihavelotsofmoneyus'
      }
    }
  }

  const Companies = {
    'binsol': {
      id: 'binsol',
      name: 'Binary Solutions',
      legalForm: 'public',
      ceoUsername: 'johnny',
      offices: [{
        street: '122 Elk Rd Little',
        city: 'Tucson'
      }, {
        street: '124 Elk Rd Little',
        city: 'Tucson'
      }]
    },
    ccc: {
      id: 'ccc',
      name: 'Cool Computers Company',
      legalForm: 'public',
      ceoUsername: 'heather',
      offices: [{
        street: '300 Elk Rd Little',
        city: 'Tucson'
      }, {
        street: '301 Elk Rd Little',
        city: 'Tucson'
      }]
    }
  }

  const Offices = [
    {
      'employeeId': 'arlene',
      'room number': 100,
      'employerId': 'binsol'
    },
    {
      'employeeId': 'will',
      'room number': 101,
      'employerId': 'binsol'
    },
    {
      'employeeId': 'johnny',
      'room number': 102,
      'employerId': 'binsol'
    },
    {
      'employeeId': 'heather',
      'room number': 100,
      'employerId': 'ccc'
    }
  ]

  const Products = {
    'product-name': 'Super Product'
  }

  const Patents = {
    'CCC OSv1': {
      patentId: '100',
      inventorId: 'heather'
    }
  }

  const Projects = {
    'Peace Among Companies': {
      projectId: 1,
      active: true,
      leadId: 'arlene'
    },
    'Operation: Control CCC': {
      projectId: 2,
      active: false,
      leadId: 'will'
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

  const Papers = {
    apples: {
      name: 'Deliciousness of apples',
      published: true
    },
    coffee: {
      name: 'How much coffee is too much coffee?',
      published: false
    },
    tennis: {
      name: 'How many tennis balls can fit into the average building?',
      published: true
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

  app.get('/api/users', (req, res) => {
    console.log(req.method, req.path)
    const limit = req.query.limit
    if (typeof limit === 'string') {
      res.send(Object.values(Users).slice(0, Number(limit)))
    } else {
      res.send(Object.values(Users))
    }
  })

  app.get('/api/users/:username', (req, res) => {
    console.log(req.method, req.path)
    res.send(Users[req.params.username])
  })

  app.get('/api/users/:username/car', (req, res) => {
    console.log(req.method, req.path)
    if (typeof req.params.username !== 'string' ||
      req.params.username === 'undefined') {
      res.status(401).send({
        message: 'Wrong username.'
      })
    } else {
      res.send({
        model: 'BMW 7 series',
        color: 'black',
        tags: {
          impression: 'decadent'
        },
        kind: 'LIMOSINE'
      })
    }
  })

  app.post('/api/users', (req, res) => {
    console.log(req.method, req.path)
    let user = req.body
    if (!('name' in user) ||
      !('address' in user) ||
      !('employerId' in user) ||
      !('hobbies' in user)) {
      res.status(400).send({
        message: 'wrong data'
      })
    } else {
      Users[user.name] = user
      res.status(201).send(user)
    }
  })

  app.get('/api/companies/:id', (req, res) => {
    console.log(req.method, req.path)
    res.send(Companies[req.params.id])
  })

  app.get('/api/cookie', (req, res) => {
    console.log(req.method, req.path, req.query, req.headers)
    if ('cookie' in req.headers) {
      res.status(200).send(`Thanks for your cookie preferences: "${req.headers.cookie}"`)
    } else {
      res.status(400).send('Need Cookie header parameter')
    }
  })

  app.get('/api/cleanDesks', (req, res) => {
    console.log(req.method, req.path)
    res.send('5 clean desks')
  })

  app.get('/api/dirtyDesks', (req, res) => {
    console.log(req.method, req.path)
    res.send('5 dirty desks')
  })

  app.get('/api/bonuses', (req, res) => {
    console.log(req.method, req.path)
    res.status(204).send()
  })

  app.get('/api/offices/:id', (req, res) => {
    console.log(req.method, req.path)

    let accept = req.headers['accept'];
    if (accept.includes('text/plain')) {
      res.set('Content-Type', 'text/plain').status(201).send('You asked for text!')
    } else if (accept.includes('application/json')) {
      if (req.params.id >= 0 && req.params.id < Offices.length) {
        res.status(201).send(Offices[req.params.id])
      } else {
        res.status(404).send({
          message: 'Cannot find office'
        })
      }
    } else {
      res.set('Content-Type', 'text/plain').status(201).send('Please try with an accept parameter!')
    }
  })

  app.get('/api/products/:id', (req, res) => {
    console.log(req.method, req.path, req.params, req.query)
    Products['product_id'] = req.params['id']
    Products['product-tag'] = req.query['product-tag']
    res.send(Products)
  })

  app.get('/api/products/:id/reviews', (req, res) => {
    console.log(req.method, req.path, req.params, req.query)
    console.log(typeof req.params.id === 'undefined')
    console.log(req.params.id === 'undefined')
    console.log(typeof req.query['product-tag'] === 'undefined')
    console.log(req.query['product-tag'] === 'undefined')

    if (typeof req.params.id === 'undefined' ||
      req.params.id === 'undefined' ||
      typeof req.query['product-tag'] === 'undefined' ||
      req.query['product-tag'] === 'undefined') {
      res.status(400).send({
        message: 'wrong data'
      })
    } else {
      res.status(200).send([
        {text: 'Great product', timestamp: 1502787600000000},
        {text: 'I love it', timestamp: 1502787400000000}
      ])
    }
  })

  app.get('/api/papers', (req, res) => {
    console.log(req.method, req.path)
    res.send(Object.values(Papers))
  })

  app.post('/api/papers', (req, res) => {
    console.log(req.method, req.path)

    let contentType = req.headers['content-type'];
    if (!contentType.includes('text/plain')) {
      res.status(400).send({
        message: 'wrong content-type, expected \'text/plain\' but received ' + contentType
      })
    } else {
      res.set('Content-Type', 'text/plain').status(201).send('You sent the paper idea: "' + JSON.parse(req.body) + '"')
    }
  })


  app.get('/api/patents/:id', authMiddleware, (req, res) => {
    console.log(req.method, req.path)
    for (let patent in Patents) {
      if (Patents[patent].patentId === req.params.id) {
        return res.send(Patents[patent])
      }
      res.status(404).send({message: 'Patent does not exist.'})
    }
  })

  app.get('/api/projects/:id', authMiddleware, (req, res) => {
    console.log(req.method, req.path)
    let p
    for (let project in Projects) {
      if (Projects[project].projectId === Number(req.params.id)) {
        p = Projects[project]
      }
    }
    if (p) {
      res.send(p)
    } else {
      res.status(404).send({message: 'Project does not exist.'})
    }
  })

  app.post('/api/projects', authMiddleware, (req, res) => {
    console.log(req.method, req.path)
    let project = req.body
    if (!('project-id' in project) ||
      !('lead-id' in project)) {
      res.status(400).send({
        message: 'wrong data'
      })
    } else {
      res.status(201).send(project)
    }
  })

  app.post('/api/products', (req, res) => {
    console.log(req.method, req.path)
    let product = req.body
    if (!('product-name' in product) ||
      !('product-id' in product) ||
      !('product-tag' in product)) {
      res.status(400).send({
        message: 'wrong data'
      })
    } else {
      res.status(201).send(product)
    }
  })

  app.get('/api/snack', (req, res) => {
    console.log(req.method, req.path, req.query, req.headers)
    if ('snack_type' in req.headers && 'snack_size' in req.headers) {
      res.status(200).send(`Here is a ${req.headers.snack_size} ${req.headers.snack_type}`)
    } else {
      res.status(400).send('Need snack_type and snack_size header parameters')
    }
  })

  app.get('/api/status', (req, res) => {
    console.log(req.method, req.path, req.query, req.headers)
    if (typeof req.query.limit === 'undefined' ||
      typeof req.get('exampleHeader') === 'undefined') {
      res.status(400).send({
        message: 'wrong request'
      })
    } else {
      res.send('Ok.')
    }
  })

  app.post('/api/status', (req, res) => {
    console.log(req.method, req.path, req.query, req.headers)
    if ('hello' in req.body && req.body['hello'] === 'world'){
      res.status(201).send('success')
    } else {
      res.status(400).send({
        message: 'wrong data, try \'hello\': \'world\''
      })
    }
  })

  app.get('/api/secure', (req, res) => {
    console.log(req.method, req.path, req.query, req.headers)
    if (req.get('authorization') !== 'Bearer abcdef') {
      res.status(401).send({
        message: 'missing authorization header'
      })
    } else {
      res.send('A secure message.')
    }
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
  startServer(3000)
}

module.exports = {
  startServer,
  stopServer
}

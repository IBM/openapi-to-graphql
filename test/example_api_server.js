'use strict'

const express = require('express')
const app = express()

const bodyParser = require('body-parser')
app.use(bodyParser.json())

const Users = {
  erik: {
    name: 'Erik Wittern',
    address: {
      street: '270 East 10th Street',
      city: 'New York City'
    },
    employerId: 'ibm',
    hobbies: ['lion dancing', 'doing CEO stuff']
  },
  jim: {
    name: 'Jim Laredo',
    address: {
      street: '6 Dogwood',
      city: 'Katonah'
    },
    employerId: 'ibm',
    hobbies: ['lion dancing', 'baseball']
  },
  ginni: {
    name: 'Ginni Rometti',
    address: {
      street: '345 Business Street',
      city: 'Armonk'
    },
    employerId: 'ibm',
    hobbies: ['chess', 'tennis']
  },
  bill: {
    name: 'Bill Gates',
    address: {
      street: '123 Some Street',
      city: 'Redmond'
    },
    employerId: 'microsoft',
    hobbies: ['making money', 'making more money']
  }
}

const Companies = {
  ibm: {
    id: 'ibm',
    name: 'International Business Machines Corporation',
    legalForm: 'public',
    ceoUsername: 'ginni',
    offices: [{
      street: '122 Some Street',
      city: 'Redmond'
    }, {
      street: '124 Some Street',
      city: 'Redmond'
    }]
  },
  microsoft: {
    id: 'microsoft',
    name: 'Microsoft',
    legalForm: 'public',
    ceoUsername: 'bill',
    offices: [{
      street: '300 Some Street',
      city: 'Redmond'
    }, {
      street: '301 Some Street',
      city: 'Redmond'
    }]
  }
}

const Products = {
  'product-name': 'Super Product'
}

const Projects = {

}

const Auth = {
  erik: {
    username: 'erik123',
    password: 'password123',
    accessToken: 'abcdef'
  },
  jim: {
    username: 'catloverxoxo',
    password: 'IActuallyPreferDogs',
    accessToken: '123456'
  },
  ginni: {
    username: 'ginni',
    password: 'password',
    accessToken: 'xyz'
  },
  bill: {
    username: 'windowsrulez',
    password: 'stevejobsisabully',
    accessToken: 'ijk'
  }
}

app.get('/api/users/:username', (req, res) => {
  console.log(req.method, req.path)
  res.send(Users[req.params.username])
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
    res.send(user)
  }
})

app.get('/api/companies/:id', (req, res) => {
  console.log(req.method, req.path)
  res.send(Companies[req.params.id])
})

app.get('/api/products/:id', (req, res) => {
  console.log(req.method, req.path, req.params, req.query)
  Products['product_id'] = req.params['id']
  Products['product-tag'] = req.query['product-tag']
  res.send(Products)
})

app.post('/api/products', (req, res) => {
  console.log(req.method, req.path)
  let product = req.body
  console.log(product)
  if (!('product-name' in product) ||
    !('product-id' in product) ||
    !('product-tag' in product)) {
    res.status(400).send({
      message: 'wrong data'
    })
  } else {
    res.send(product)
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

// app.get('/api/patents/:id', (req, res) => {
//   console.log(req.method, req.path)
//   if (req.headers.authorization) {
//     let encoded = req.headers.authorization.split(' ')[1]
//     let decoded = new Buffer(encoded, 'base64').toString('utf8').split(':')
//
//     if (decoded.length === 2) {
//       let credentials = {
//         username: decoded[0],
//         password: decoded[1]
//       }
//       for (let user in Auth) {
//         if (Auth[user].username === credentials.username && Auth[user].password === credentials.password) {
//           return res.send({
//             'patent-name': 'oasgraph',
//             'patent-id': req.params.id
//           })
//         }
//       }
//       return res.status(401).send({
//         message: 'Incorrect credentials'
//       })
//     } else {
//       return res.status(401).send({
//         message: 'Credentials sent incorrectly'
//       })
//     }
//   } else if ('access_token' in req.headers) {
//     for (let user in Auth) {
//       if (Auth[user].accessToken === req.headers.access_token) {
//         return res.send({
//           'patent-name': 'oasgraph',
//           'patent-id': req.params.id
//         })
//       }
//     }
//     return res.status(401).send({
//       message: 'Incorrect credentials'
//     })
//   } else if ('access_token' in req.query) {
//     for (let user in Auth) {
//       if (Auth[user].accessToken === req.query.access_token) {
//         return res.send({
//           'patent-name': 'oasgraph',
//           'patent-id': req.params.id
//         })
//       }
//     }
//     return res.status(401).send({
//       message: 'Incorrect credentials'
//     })
//   } else {
//     return res.status(401).send({
//       message: 'Missing credentials'
//     })
//   }
// })

app.get('/api/patents/:id', (req, res) => {
  if (isAuthenticated(req, res)) {
    return res.send({
      'patent-name': 'oasgraph',
      'patent-id': req.params.id
    })
  }
})

app.get('/api/projects/:id', (req, res) => {
  if (isAuthenticated(req, res)) {
    return res.send(Projects[req.params.id])
  }
})

app.post('/api/projects', (req, res) => {
  if (isAuthenticated(req, res)) {
    let project = req.body
    if (!('project-name' in project) ||
      !('project-id' in project) ||
      !('project-tag' in project)) {
      res.status(400).send({
        message: 'wrong data'
      })
    } else {
      res.send(project)
    }
  }
})

const isAuthenticated = (req, res) => {
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
          return true
        }
      }
      res.status(401).send({
        message: 'Incorrect credentials'
      })
      return false
    } else {
      res.status(401).send({
        message: 'Basic Auth expects a single username and a single password'
      })
      return false
    }
  } else if ('access_token' in req.headers) {
    for (let user in Auth) {
      if (Auth[user].accessToken === req.headers.access_token) {
        return res.send(Projects[req.params.username])
      }
    }
    res.status(401).send({
      message: 'Incorrect credentials'
    })
    return false
  } else if ('access_token' in req.query) {
    for (let user in Auth) {
      if (Auth[user].accessToken === req.query.access_token) {
        return true
      }
    }
    res.status(401).send({
      message: 'Incorrect credentials'
    })
    return false
  } else {
    res.status(401).send({
      message: 'Unknown/missing credentials'
    })
    return false
  }
}

app.listen(3000, () => {
  console.log('Example API accessible on port 3000')
})

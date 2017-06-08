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
    },
    {
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
    },
    {
      street: '301 Some Street',
      city: 'Redmond'
    }]
  }
}

app.post('/api/users', (req, res) => {
  console.log(req.method, req.path)
  let user = req.body
  console.log(req.body)
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

app.get('/api/users/:username', (req, res) => {
  console.log(req.method, req.path)
  res.send(Users[req.params.username])
})

app.get('/api/companies/:id', (req, res) => {
  console.log(req.method, req.path)
  res.send(Companies[req.params.id])
})

app.listen(3000, () => {
  console.log('Example API accessible on port 3000')
})

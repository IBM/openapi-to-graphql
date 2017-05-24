'use strict'

const express = require('express')
const app = express()

const Users = {
  erik: {
    username: 'Erik Wittern',
    address: {
      street: '270 East 10th Street',
      city: 'New York City'
    },
    employerId: 'ibm'
  },
  jim: {
    username: 'Jim Laredo',
    address: {
      street: '6 Dogwood',
      city: 'Katonah'
    },
    employerId: 'ibm'
  },
  bill: {
    username: 'Bill Gates',
    address: {
      street: '123 Some Street',
      city: 'Redmond'
    },
    employerId: 'microsoft'
  }
}

const Companies = {
  ibm: {
    id: 'ibm',
    name: 'International Business Machines Corporation',
    legalForm: 'public',
    ceo: 'erik'
  },
  microsoft: {
    id: 'microsoft',
    name: 'Microsoft',
    legalForm: 'public',
    ceo: 'bill'
  }
}

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

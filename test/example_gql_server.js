'use strict'

const express = require('express')
const graphqlHTTP = require('express-graphql')
const app = express()
const OasGraph = require('../index.js')

let oas = require('./example_oas.json')
let schema = OasGraph.createGraphQlSchema(oas)

app.use('/graphql', graphqlHTTP({
  schema: schema,
  graphiql: true
}))

app.listen(3001, () => {
  console.log('GraphQL accessible at: http://localhost:3001/graphql')
})

'use strict'

/* globals beforeAll, test, expect */

const OasGraph = require('../lib/index.js')
const {
  parse,
  validate
} = require('graphql')

let oas = require('./fixtures/cloudfunction_oas.json')
let schema

beforeAll(async () => {
  schema = await OasGraph.createGraphQlSchema(oas)
})

test('Get response', async () => {
  let query = `mutation {
    mutationViewerBasicAuth (username: "test" password: "data") {
      postSpecActionTestAction2 (payloadInput: {age: 27}) {
        payload
        age
      }
    }
  }`
  // validate that 'limit' parameter is covered by options:
  let ast = parse(query)
  let errors = validate(schema, ast)
  expect(errors).toEqual([])
})

// Copyright IBM Corp. 2017. All Rights Reserved.
// Node module: oasgraph
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

/* globals beforeAll, test, expect */

const OasGraph = require('../lib/index.js')
const {
  parse,
  validate
} = require('graphql')

let oas = require('./fixtures/cloudfunction_oas.json')
let createdSchema

beforeAll(async () => {
  let {schema} = await OasGraph.createGraphQlSchema(oas)
  createdSchema = schema
})

test('Get response', async () => {
  let query = `mutation {
    mutationViewerBasicAuth (username: "test" password: "data") {
      postTestAction2 (payloadInput: {age: 27}) {
        payload
        age
      }
    }
  }`
  // validate that 'limit' parameter is covered by options:
  let ast = parse(query)
  let errors = validate(createdSchema, ast)
  expect(errors).toEqual([])
})

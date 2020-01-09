// Copyright IBM Corp. 2017. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

/* globals beforeAll, test, expect */

import * as openAPIToGraphQL from '../lib/index'
const { parse, validate } = require('graphql')

const oas = require('./fixtures/cloudfunction.json')

let createdSchema

beforeAll(async () => {
  const { schema } = await openAPIToGraphQL.createGraphQLSchema(oas)
  createdSchema = schema
})

test('Get response', async () => {
  const query = `mutation {
    mutationViewerBasicAuth (username: "test" password: "data") {
      postTestAction2 (payloadInput: {age: 27}) {
        payload
        age
      }
    }
  }`
  // validate that 'limit' parameter is covered by options:
  const ast = parse(query)
  const errors = validate(createdSchema, ast)
  expect(errors).toEqual([])
})

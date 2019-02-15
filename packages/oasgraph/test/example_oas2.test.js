// Copyright IBM Corp. 2017,2018. All Rights Reserved.
// Node module: oasgraph
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

/* globals beforeAll, test, expect */

const OasGraph = require('../lib/index.js')

/**
 * Set up the schema first
 */
let oas = require('./fixtures/example_oas2.json')
let createdSchema
beforeAll(() => {
  return OasGraph.createGraphQlSchema(oas, { operationIdFieldNames: true })
    .then(({schema, report}) => {
      createdSchema = schema
      console.log(schema._typeMap
        .Query
        .getFields())
    })
})

test('The option operationIdFieldNames should allow all operations to be present', () => {
  let oasGetCount = 0
  for (let path in oas.paths) {
    for (let method in oas.paths[path]) {
      if (method === 'get') oasGetCount++
    }
  }

  let gqlTypes = Object.keys(createdSchema
    ._typeMap
    .Query
    .getFields()
  ).length
  expect(gqlTypes).toEqual(oasGetCount)
})

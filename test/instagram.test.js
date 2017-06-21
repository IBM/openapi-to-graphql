'use strict'

/* globals beforeAll, test, expect */

const OasGraph = require('../index.js')

/**
 * Set up the schema first
 */
let oas = require('./fixtures/instagram.json')
let schema
beforeAll(() => {
  return OasGraph.createGraphQlSchema(oas)
    .then(createdSchema => {
      schema = createdSchema
    })
})

test('All Instagram query endpoints present', () => {
  let oasGetCount = 0
  for (let path in oas.paths) {
    for (let method in oas.paths[path]) {
      if (method === 'get') oasGetCount++
    }
  }
  let gqlTypes = Object.keys(schema
    ._typeMap
    .RootQueryType
    .getFields()
    .QueryViewerAnyAuth
    .type
    .getFields()
  ).length
  expect(gqlTypes).toEqual(oasGetCount)
})

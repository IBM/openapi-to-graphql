'use strict'

/* globals beforeAll, test, expect */

const OasGraph = require('../lib/index.js')

/**
 * Set up the schema first
 */
let oas = require('./fixtures/instagram.json')
let createdSchema
beforeAll(() => {
  return OasGraph.createGraphQlSchema(oas)
    .then(({schema}) => {
      createdSchema = schema
    })
})

test('All Instagram query endpoints present', () => {
  let oasGetCount = 0
  for (let path in oas.paths) {
    for (let method in oas.paths[path]) {
      if (method === 'get') oasGetCount++
    }
  }
  let gqlTypes = Object.keys(createdSchema
    ._typeMap
    .query
    .getFields()
    .viewerAnyAuth
    .type
    .getFields()
  ).length
  expect(gqlTypes).toEqual(oasGetCount)
})

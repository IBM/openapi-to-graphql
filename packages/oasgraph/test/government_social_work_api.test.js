// Copyright IBM Corp. 2017,2018. All Rights Reserved.
// Node module: oasgraph
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

/* globals beforeAll, test, expect */

const OasGraph = require('../lib/index')
const Oas3Tools = require('../lib/oas_3_tools')
const {
  parse,
  validate
} = require('graphql')

/**
 * Set up the schema first
 */
let oas = require('./fixtures/government_social_work_api.json')
let createdSchema
beforeAll(() => {
  return OasGraph.createGraphQlSchema(oas)
    .then(({schema, report}) => {
      createdSchema = schema
    })
})

test('All query endpoints present', () => {
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

test('All mutation endpoints present', () => {
  let oasMutCount = 0
  for (let path in oas.paths) {
    for (let method in oas.paths[path]) {
      if (Oas3Tools.isOperation(method) && method !== 'get') oasMutCount++
    }
  }
  let gqlTypes = Object.keys(createdSchema
    ._typeMap
    .Mutation
    .getFields()
  ).length
  expect(gqlTypes).toEqual(oasMutCount)
})

test('Get resource', () => {
  let query = `{
    assessmentTypes (
      contentType: ""
      acceptLanguage: ""
      userAgent:""
      apiVersion:"1.1.0"
      offset: "40"
      limit: "test"
    ) {
      data {
        assessmentTypeId
      }
    }
  }`
  let ast = parse(query)
  let errors = validate(createdSchema, ast)
  expect(errors).toEqual([])
})

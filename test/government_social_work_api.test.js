'use strict'

/* globals beforeAll, test, expect */

const OasGraph = require('../lib/index.js')
const Oas3Tools = require('../src/oas_3_tools.js')
const {
  parse,
  validate
} = require('graphql')

/**
 * Set up the schema first
 */
let oas = require('./fixtures/government_social_work_api.json')
let schema
beforeAll(() => {
  return OasGraph.createGraphQlSchema(oas)
    .then(createdSchema => {
      schema = createdSchema
    })
})

test('All query endpoints present', () => {
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
  let gqlTypes = Object.keys(schema
    ._typeMap
    .RootMutationType
    .getFields()
  ).length
  expect(gqlTypes).toEqual(oasMutCount)
})

test('Get resource', () => {
  let query = `{
    AssessmentTypes (
      ContentType: ""
      AcceptLanguage: ""
      UserAgent:""
      ApiVersion:"1.1.0"
      offset: "40"
      limit: "test"
    ) {
      data {
        assessmentTypeId
      }
    }
  }`
  let ast = parse(query)
  let errors = validate(schema, ast)
  expect(errors).toEqual([])
})

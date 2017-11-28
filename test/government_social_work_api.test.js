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
    .query
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
    .mutation
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

test('Strict mode throws exception', () => {
  return OasGraph.createGraphQlSchema(oas, {strict: true})
    .catch(e =>
    expect(e.message).toMatch(`Warning: Cannot add sub operation 'caseCaseAssessments' to 'case' due to name collision.`)
  )
})

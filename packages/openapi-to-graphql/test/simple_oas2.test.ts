// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

/* globals test, expect */

import { graphql } from 'graphql'

import * as openapiToGraphql from '../lib/index'
import { Options } from '../lib/types/options'

const oas = require('./fixtures/simple_oas2.json')
const api = require('./simple_oas2_server')

const PORT = 3007
// update PORT for this test case:
oas['x-servers'][0].variables.port.default = String(PORT)

let createdSchema

/**
 * Set up the schema first and run example API server
 */
beforeAll(() => {
  return Promise.all([
    openapiToGraphql
      .createGraphQlSchema([oas], {
        fillEmptyResponses: true
      })
      .then(({ schema, report }) => {
        createdSchema = schema
      }),
    api.startServer(PORT)
  ])
})

/**
 * Shut down API server
 */
afterAll(() => {
  return Promise.all([api.stopServer()])
})

test('Generate schema without problems', () => {
  const options: Options = {
    strict: false
  }
  return openapiToGraphql
    .createGraphQlSchema(oas, options)
    .then(({ schema }) => {
      expect(schema).toBeTruthy()
    })
})

test('Does not include header parameters in operation', () => {
  const options: Options = {
    strict: false
  }
  return openapiToGraphql
    .createGraphQlSchema(oas, options)
    .then(({ schema }) => {
      const query = `mutation {
        postFile {
          type
        }
      }`

      return graphql(schema, query).then(result => {
        expect(result).toEqual({
          data: {
            postFile: {
              // TODO: change this test when this issue is resolved
              // https://github.com/IBM/openapi-to-graphql/issues/273
              // type: 'TEST_ENUM'
              type: 'TESTENUM'
            }
          }
        })
      })
    })
})

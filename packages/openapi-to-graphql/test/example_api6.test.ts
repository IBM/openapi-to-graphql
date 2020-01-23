// Copyright IBM Corp. 2017,2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

/* globals beforeAll, test, expect */

import { graphql, parse, validate } from 'graphql'

import * as openAPIToGraphQL from '../lib/index'
import { Options } from '../lib/types/options'
import { startServer, stopServer } from './example_api6_server'

const oas = require('./fixtures/example_oas6.json')
const PORT = 3009
// Update PORT for this test case:
oas.servers[0].variables.port.default = String(PORT)

let createdSchema

/**
 * Set up the schema first and run example API server
 */
beforeAll(() => {
  return Promise.all([
    openAPIToGraphQL.createGraphQLSchema(oas).then(({ schema, report }) => {
      createdSchema = schema
    }),
    startServer(PORT)
  ])
})

/**
 * Shut down API server
 */
afterAll(() => {
  return stopServer()
})

test('Option requestOptions should work with links', () => {
  // Verifying the behavior of the link by itself
  const query = `{
    object {
      object2Link {
        data
      }
      withParameter: object2Link (specialheader: "extra data"){
        data
      }
    }
  }`

  const promise = graphql(createdSchema, query).then(result => {
    expect(result.data).toEqual({
      object: {
        object2Link: {
          data: 'object2'
        },
        withParameter: {
          data: "object2 with special header: 'extra data'"
        }
      }
    })
  })

  const options: Options = {
    requestOptions: {
      url: undefined,
      headers: {
        specialheader: 'requestOptions'
      }
    }
  }

  const query2 = `{
    object {
      object2Link {
        data
      }
    }
  }`

  const promise2 = openAPIToGraphQL
    .createGraphQLSchema(oas, options)
    .then(({ schema }) => {
      const ast = parse(query2)
      const errors = validate(schema, ast)
      expect(errors).toEqual([])
      return graphql(schema, query2).then(result => {
        expect(result).toEqual({
          data: {
            object: {
              object2Link: {
                data: "object2 with special header: 'requestOptions'" // Data from requestOptions in a link
              }
            }
          }
        })
      })
    })

  return Promise.all([promise, promise2])
})

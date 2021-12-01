'use strict'

import { afterAll, beforeAll, expect, test } from '@jest/globals'
import * as openAPIToGraphQL from '../src/index'
import * as Oas3Tools from '../src/oas_3_tools'

import { startServer, stopServer } from './file_upload_server'
import { graphql } from 'graphql'

/**
 * Set up the schema first
 */
const oas = require('./fixtures/file_upload.json')
const PORT = 3010

// Update PORT for this test case:
oas.servers[0].variables.port.default = String(PORT)

let createdSchema

beforeAll(async () => {
  const [{ schema }] = await Promise.all([
    openAPIToGraphQL.createGraphQLSchema(oas),
    startServer(PORT)
  ])

  createdSchema = schema
})

afterAll(async () => {
  await stopServer()
})

test('All mutation endpoints are found to be present', () => {
  let oasMutCount = 0
  for (let path in oas.paths) {
    for (let method in oas.paths[path]) {
      if (Oas3Tools.isHttpMethod(method) && method !== 'get') oasMutCount++
    }
  }
  const gqlTypes = Object.keys(createdSchema._typeMap.Mutation.getFields())
        .length
  expect(gqlTypes).toEqual(oasMutCount)
})

test('registers the graphql-upload Upload scalar type', async () => {
  const query = `{
    __type(name: "Upload") {
      name
      kind
    }
  }`

  const result = await graphql(createdSchema, query)
  expect(result).toEqual({
    data: {
      __type: {
        name: 'Upload',
        kind: 'SCALAR'
      }
    }
  })
})

test('introspection for mutations returns a mutation matching the custom field specified for the multipart API definition', async () => {
  const query = `{
    __schema {
      mutationType {
        fields {
          name
          type {
            name
            kind
          }
        }
      }
    }
  }`

  const result = await graphql(createdSchema, query)
  expect(result).toEqual({
    data: {
      __schema: {
        mutationType: {
          fields: expect.arrayContaining([
            expect.objectContaining({
              name: 'fileUploadTest'
            })
          ])
        }
      }
    }
  })
})

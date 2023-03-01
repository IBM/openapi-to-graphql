// Copyright IBM Corp. 2017,2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

import { afterAll, beforeAll, expect, test } from '@jest/globals'
import { graphql, GraphQLSchema } from 'graphql'

import * as openAPIToGraphQL from '../src/index'
import express from 'express'
import http from 'http'

// Set up the schema first
const oas = require('./fixtures/query_arguments.json')
const PORT = 31002
// Update PORT for this test case:
oas.servers[0].variables.port.default = String(PORT)

async function startServer () {
  const app = express()

  const data = [
    { id: 1 },
    { id: 2 },
    { id: 3 }
  ]

  app.get('/todos', (req, res) => {
    const ids = req.query.id__in as unknown as Array<number>

    res.send(data.filter((x) => ids.includes(x.id)))
  })

  return new Promise<http.Server>((resolve) => {
    const server = app.listen(PORT, () => resolve(server))
  })
}

let server: http.Server
let createdSchema: GraphQLSchema
beforeAll(async () => {
  server = await startServer()

  return openAPIToGraphQL
    .createGraphQLSchema(oas)
    .then(({ schema }) => {
      createdSchema = schema
    })
})

afterAll(() => new Promise<void>((resolve) => {
  server.close(() => resolve())
}))

test('Query Arguments', () => {
  const query = `{
    todos(idIn: [1]) {
      id
    }
  }`

  return graphql(createdSchema, query).then((result) => {
    expect(result).toEqual({
      data: {
        todos: [{
          id: 1
        }]
      }
    })
  })
})

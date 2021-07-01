// Copyright IBM Corp. 2017,2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

import { afterAll, beforeAll, expect, test } from '@jest/globals'

import * as openAPIToGraphQL from '../src/index'

/**
 * Set up the schema first
 */
const oas = require('./fixtures/instagram.json')

let createdSchema
beforeAll(() => {
  return openAPIToGraphQL
    .createGraphQLSchema(oas)
    .then(({ schema, report }) => {
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
  const gqlTypes = Object.keys(
    createdSchema._typeMap.Query.getFields().viewerAnyAuth.type.getFields()
  ).length
  expect(gqlTypes).toEqual(oasGetCount)
})

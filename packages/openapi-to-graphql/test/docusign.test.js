// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

/* globals test, expect */

const openapiToGraphql = require('../lib/index.js')

let oas = require('./fixtures/docusign_oas.json')

test('Generate schema without problems', () => {
  let options = {
    strict: false
  }
  return openapiToGraphql
    .createGraphQlSchema(oas, options)
    .then(({ schema }) => {
      expect(schema).toBeTruthy()
    })
})

'use strict'

/* globals test, expect */

const OasGraph = require('../lib/index.js')

let oas = require('./fixtures/docusign_oas.json')

test('Generate schema without problems', () => {
  let options = {
    strict: false
  }
  return OasGraph.createGraphQlSchema(oas, options)
    .then(({schema}) => {
      expect(schema).toBeTruthy()
    })
})

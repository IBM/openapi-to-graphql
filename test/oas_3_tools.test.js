'use strict'

/* globals test, expect */

const Oas3Tools = require('../src/oas_3_tools.js')

test('Applying beautify multiple times does not change outcome', () => {
  let str = 'this Super*annoying-string()'
  let once = Oas3Tools.beautify(str)
  let twice = Oas3Tools.beautify(once)
  expect(twice).toEqual(once)
})

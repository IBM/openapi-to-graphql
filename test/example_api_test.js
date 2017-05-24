'use strict'

const lib = require('../index.js')
const oas = require('./example_oas.json')

lib.createGraphQlSchema(oas)

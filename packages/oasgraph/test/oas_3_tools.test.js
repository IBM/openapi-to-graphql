// Copyright IBM Corp. 2017. All Rights Reserved.
// Node module: oasgraph
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

/* globals test, expect */

const {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  graphql
} = require('graphql')
const Oas3Tools = require('../lib/oas_3_tools.js')

test('Applying beautify multiple times does not change outcome', () => {
  let str = 'this Super*annoying-string()'
  let once = Oas3Tools.beautify(str)
  let twice = Oas3Tools.beautify(once)
  expect(twice).toEqual(once)
})

test('Sanitize object keys', () => {
  let obj = {
    'a_key': {
      'b&**key': 'test !!'
    }
  }
  let clean = Oas3Tools.sanitizeObjKeys(obj)
  expect(clean).toEqual({
    aKey: {
      bKey: 'test !!'
    }
  })
})

test('Sanitize object keys including array', () => {
  let obj = {
    'a_key': {
      'b&**key': 'test !!',
      'asf blah': [
        {'a)(a': 'test2'}
      ]
    }
  }
  let clean = Oas3Tools.sanitizeObjKeys(obj)
  expect(clean).toEqual({
    aKey: {
      bKey: 'test !!',
      asfBlah: [{
        aA: 'test2'
      }]
    }
  })
})

test('Sanitize object keys when given an array', () => {
  let obj = [
    {'a)(a': {
      'b_2': 'test'
    }}
  ]
  let clean = Oas3Tools.sanitizeObjKeys(obj)
  expect(clean).toEqual([{
    aA: {
      b2: 'test'
    }
  }])
})

test('Sanitize object keys, but not $ref', () => {
  let obj = {
    '$ref': {
      'a-b': 'test'
    }
  }
  let clean = Oas3Tools.sanitizeObjKeys(obj, ['$ref'])
  expect(clean).toEqual({
    $ref: {
      aB: 'test'
    }
  })
})

let mapping = {
  'productId': 'product-id',
  'productName': 'product-name',
  'productTag': 'product-tag'
}

test('Desanitize object keys', () => {
  let obj = {
    productId: '123',
    info: {
      productName: 'Soccer'
    }
  }
  let raw = Oas3Tools.desanitizeObjKeys(obj, mapping)
  expect(raw).toEqual({
    'product-id': '123',
    info: {
      'product-name': 'Soccer'
    }
  })
})

test('Desanitize object keys including array', () => {
  let obj = {
    'productId': {
      info: [
        {'productName': 'test1'},
        {'productTag': 'test2'}
      ]
    }
  }
  let clean = Oas3Tools.desanitizeObjKeys(obj, mapping)
  expect(clean).toEqual({
    'product-id': {
      info: [
        {'product-name': 'test1'},
        {'product-tag': 'test2'}
      ]
    }
  })
})

test('Desanitize object keys when given an array', () => {
  let obj = [
    {'productName': {
      'productTag': 'test'
    }}
  ]
  let clean = Oas3Tools.desanitizeObjKeys(obj, mapping)
  expect(clean).toEqual([{
    'product-name': {
      'product-tag': 'test'
    }
  }])
})

test('Properly treat null values during sanitization', () => {
  let schema = new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'Query',
      fields: {
        User: {
          name: 'name',
          type: new GraphQLObjectType({
            name: 'user',
            fields: {
              name: {
                type: GraphQLString
              }
            }
          }),
          resolve: (root, args, context) => {
            let data = {
              name: null
            }
            return Oas3Tools.sanitizeObjKeys(data)
          }
        }
      }
    })
  })

  let query = `{
    User {
      name
    }
  }`

  graphql(schema, query).then(result => {
    expect(result).toEqual({
      'data': {
        'User': {
          'name': null
        }
      }
    })
  })
})

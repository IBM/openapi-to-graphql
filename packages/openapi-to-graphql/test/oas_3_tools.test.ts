// Copyright IBM Corp. 2017. All Rights Reserved.
// Node module: openapi-to-graphql
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
import * as Oas3Tools from '../lib/oas_3_tools.js'

test('Applying sanitize multiple times does not change outcome', () => {
  const str = 'this Super*annoying-string()'
  const once = Oas3Tools.sanitize(str)
  const twice = Oas3Tools.sanitize(once)
  expect(twice).toEqual(once)
})

test('Sanitize object keys', () => {
  const obj = {
    a_key: {
      'b&**key': 'test !!'
    }
  }
  const clean = Oas3Tools.sanitizeObjKeys(obj)
  expect(clean).toEqual({
    aKey: {
      bKey: 'test !!'
    }
  })
})

test('Sanitize object keys including array', () => {
  const obj = {
    a_key: {
      'b&**key': 'test !!',
      'asf blah': [{ 'a)(a': 'test2' }]
    }
  }
  const clean = Oas3Tools.sanitizeObjKeys(obj)
  expect(clean).toEqual({
    aKey: {
      bKey: 'test !!',
      asfBlah: [
        {
          aA: 'test2'
        }
      ]
    }
  })
})

test('Sanitize object keys when given an array', () => {
  const obj = [
    {
      'a)(a': {
        b_2: 'test'
      }
    }
  ]
  const clean = Oas3Tools.sanitizeObjKeys(obj)
  expect(clean).toEqual([
    {
      aA: {
        b2: 'test'
      }
    }
  ])
})

test('Sanitize object keys, but not $ref', () => {
  const obj = {
    $ref: {
      'a-b': 'test'
    }
  }
  const clean = Oas3Tools.sanitizeObjKeys(obj, ['$ref'])
  expect(clean).toEqual({
    $ref: {
      aB: 'test'
    }
  })
})

const mapping = {
  productId: 'product-id',
  productName: 'product-name',
  productTag: 'product-tag'
}

test('Desanitize object keys', () => {
  const obj = {
    productId: '123',
    info: {
      productName: 'Soccer'
    }
  }
  const raw = Oas3Tools.desanitizeObjKeys(obj, mapping)
  expect(raw).toEqual({
    'product-id': '123',
    info: {
      'product-name': 'Soccer'
    }
  })
})

test('Desanitize object keys including array', () => {
  const obj = {
    productId: {
      info: [{ productName: 'test1' }, { productTag: 'test2' }]
    }
  }
  const clean = Oas3Tools.desanitizeObjKeys(obj, mapping)
  expect(clean).toEqual({
    'product-id': {
      info: [{ 'product-name': 'test1' }, { 'product-tag': 'test2' }]
    }
  })
})

test('Desanitize object keys when given an array', () => {
  const obj = [
    {
      productName: {
        productTag: 'test'
      }
    }
  ]
  const clean = Oas3Tools.desanitizeObjKeys(obj, mapping)
  expect(clean).toEqual([
    {
      'product-name': {
        'product-tag': 'test'
      }
    }
  ])
})

test('Properly treat null values during sanitization', () => {
  const schema = new GraphQLSchema({
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
            const data = {
              name: null
            }
            return Oas3Tools.sanitizeObjKeys(data)
          }
        }
      }
    })
  })

  const query = `{
    User {
      name
    }
  }`

  graphql(schema, query).then(result => {
    expect(result).toEqual({
      data: {
        User: {
          name: null
        }
      }
    })
  })
})

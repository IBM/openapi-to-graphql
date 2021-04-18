// Copyright IBM Corp. 2017,2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

import { graphql } from 'graphql'
import { afterAll, beforeAll, expect, test } from '@jest/globals'

import * as openAPIToGraphQL from '../lib/index'

const api = require('./example_api8_server')

const oas = require('./fixtures/example_oas8.json')

const PORT = 3004
// Update PORT for this test case:
oas.servers[0].variables.port.default = String(PORT)

/**
 * This test suite is used to verify the behavior of interOAS links, i.e.
 * links across different OASs
 */

let createdSchema

/**
 * Set up the schema first and run example API server
 */
beforeAll(() => {
  return Promise.all([
    openAPIToGraphQL.createGraphQLSchema([oas]).then(({ schema, report }) => {
      createdSchema = schema
    }),
    api.startServer(PORT)
  ])
})

/**
 * Shut down API server
 */
afterAll(() => {
  return Promise.all([api.stopServer()])
})

test('Basic query for types list', () => {
  const query = `query {
    typesList {
      __typename
      ... on FirstDerivedType {
        name,
        baseAttribute,
        kind,
        firstDerivedTypeAttribute
      },
      ... on SecondDerivedType {
        name,
        baseAttribute,
        kind,
        secondDerivedTypeAttribute
      }
    }
  }`
  return graphql(createdSchema, query).then((result) => {
    expect(result).toEqual({
      data: {
        typesList: [
          {
            baseAttribute: 'authorBaseAttributeValue',
            kind: 'FIRST_DERIVED_TYPE',
            firstDerivedTypeAttribute: 1,
            name: 'author',
            __typename: 'FirstDerivedType'
          },
          {
            baseAttribute: 'bookBaseAttributeValue',
            kind: 'SECOND_DERIVED_TYPE',
            secondDerivedTypeAttribute: 'listOfBooks',
            name: 'book',
            __typename: 'SecondDerivedType'
          }
        ]
      }
    })
  })
})

test('Query single union type with discriminator', () => {
  const query = `query {
    firstDerivedType: baseType(typeName: "author") {
      ... on FirstDerivedType {
        name,
        kind,
        firstDerivedTypeAttribute
      },
      ... on SecondDerivedType {
        name,
        kind,
        secondDerivedTypeAttribute
      }
    },
    secondDerivedType: baseType(typeName: "book") {
      ... on FirstDerivedType {
        name,
        kind,
        firstDerivedTypeAttribute
      },
      ... on SecondDerivedType {
        name,
        kind,
        secondDerivedTypeAttribute
      }
    }
  }`

  return graphql(createdSchema, query).then((result) => {
    expect(result).toEqual({
      data: {
        firstDerivedType: {
          kind: 'FIRST_DERIVED_TYPE',
          firstDerivedTypeAttribute: 1,
          name: 'author'
        },
        secondDerivedType: {
          kind: 'SECOND_DERIVED_TYPE',
          secondDerivedTypeAttribute: 'listOfBooks',
          name: 'book'
        }
      }
    })
  })
})

test('Querty with FirstDerivedType in response schema', () => {
  const query = `query {
    firstDerivedType {
      kind,
      firstDerivedTypeAttribute,
      name,
      baseAttribute
    }
  }`

  return graphql(createdSchema, query).then((result) => {
    expect(result).toEqual({
      data: {
        firstDerivedType: {
          baseAttribute: 'authorBaseAttributeValue',
          kind: 'FIRST_DERIVED_TYPE',
          firstDerivedTypeAttribute: 1,
          name: 'author'
        }
      }
    })
  })
})

test('Query with SecondDerivedType in response schema', () => {
  const query = `query {
    secondDerivedType {
      kind,
      secondDerivedTypeAttribute,
      name,
      baseAttribute
    }
  }`

  return graphql(createdSchema, query).then((result) => {
    expect(result).toEqual({
      data: {
        secondDerivedType: {
          baseAttribute: 'bookBaseAttributeValue',
          kind: 'SECOND_DERIVED_TYPE',
          secondDerivedTypeAttribute: 'listOfBooks',
          name: 'book'
        }
      }
    })
  })
})

test('Query single union type with oneOf', () => {
  const query = `query {
    firstDerivedType: oneOfDerivedType(typeName: "author") {
      __typename
      ... on FirstDerivedType {
        name,
        kind,
        firstDerivedTypeAttribute
      },
      ... on SecondDerivedType {
        name,
        kind,
        secondDerivedTypeAttribute
      }
    },
    secondDerivedType: oneOfDerivedType(typeName: "book") {
      __typename
      ... on FirstDerivedType {
        name,
        kind,
        firstDerivedTypeAttribute
      },
      ... on SecondDerivedType {
        name,
        kind,
        secondDerivedTypeAttribute
      }
    }
  }`

  return graphql(createdSchema, query).then((result) => {
    expect(result).toEqual({
      data: {
        firstDerivedType: {
          kind: 'FIRST_DERIVED_TYPE',
          firstDerivedTypeAttribute: 1,
          name: 'author',
          __typename: 'FirstDerivedType'
        },
        secondDerivedType: {
          kind: 'SECOND_DERIVED_TYPE',
          secondDerivedTypeAttribute: 'listOfBooks',
          name: 'book',
          __typename: 'SecondDerivedType'
        }
      }
    })
  })
})

test('Create single type', () => {
  const mutation = `mutation {
    postType(baseTypeCommandInput: {
      baseTypeCommandAttribute: "createTypeCommandInput",
      type: {
        kind: "SECOND_DERIVED_TYPE",
        secondDerivedTypeAttribute: "createdBookShopType",
        name: "bookShop",
        baseAttribute: "createdBookShopBaseAttribute"
      }
    }) {
      data
    }
  }`

  return graphql(createdSchema, mutation).then((result) => {
    expect(result).toEqual({
      data: {
        postType: {
          data: 'createTypeCommandInput'
        }
      }
    })
  })
})

test('Query list of types with created tpye', () => {
  const query = `query {
    typesList {
      __typename
      ... on FirstDerivedType {
        name,
        baseAttribute,
        kind,
        firstDerivedTypeAttribute
      },
      ... on SecondDerivedType {
        name,
        baseAttribute,
        kind,
        secondDerivedTypeAttribute
      }
    }
  }`
  return graphql(createdSchema, query).then((result) => {
    expect(result).toEqual({
      data: {
        typesList: [
          {
            baseAttribute: 'authorBaseAttributeValue',
            kind: 'FIRST_DERIVED_TYPE',
            firstDerivedTypeAttribute: 1,
            name: 'author',
            __typename: 'FirstDerivedType'
          },
          {
            baseAttribute: 'bookBaseAttributeValue',
            kind: 'SECOND_DERIVED_TYPE',
            secondDerivedTypeAttribute: 'listOfBooks',
            name: 'book',
            __typename: 'SecondDerivedType'
          },
          {
            baseAttribute: 'createdBookShopBaseAttribute',
            kind: 'SECOND_DERIVED_TYPE',
            secondDerivedTypeAttribute: 'createdBookShopType',
            name: 'bookShop',
            __typename: 'SecondDerivedType'
          }
        ]
      }
    })
  })
})

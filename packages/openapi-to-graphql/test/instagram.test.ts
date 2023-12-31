// Copyright IBM Corp. 2017,2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

import { afterAll, beforeAll, expect, test } from '@jest/globals'
import { GraphQLObjectType, GraphQLSchema } from 'graphql'

import * as openAPIToGraphQL from '../src/index'

// Set up the schema first
const oas = require('./fixtures/instagram.json')

let createdSchema: GraphQLSchema
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
    ((createdSchema.getTypeMap().Query as GraphQLObjectType).getFields().viewerAnyAuth.type as GraphQLObjectType).getFields()
  ).length
  expect(gqlTypes).toEqual(oasGetCount)
})

test('Instagram deprecated directives test', () => {
  const deprecatedOperations = []
  for (let path in oas.paths) {
    for (let method in oas.paths[path]) {
      const operation = oas.paths[path][method]
      if (operation.deprecated) deprecatedOperations.push(operation)
    }
  }
  const gqlQueryTypes = 
  ((createdSchema.getTypeMap().Query as GraphQLObjectType).getFields().viewerAnyAuth.type as GraphQLObjectType).getFields()
  const gqlMutationTypes = 
  ((createdSchema.getTypeMap().Mutation as GraphQLObjectType).getFields().mutationViewerAnyAuth.type as GraphQLObjectType).getFields()
  const gqlTypes = {...gqlQueryTypes, ...gqlMutationTypes}
  const deprecatedTypes = []
  for (let type in gqlTypes) {
    if (gqlTypes[type].deprecationReason) {
      deprecatedTypes.push(gqlTypes[type])
    }
  }
  expect(deprecatedOperations.length).toEqual(deprecatedTypes.length)
  const includesDescription = deprecatedOperations.map(operation => deprecatedTypes.some(type => type.description.includes(operation.description)))
  const everyTrue = includesDescription.every(v => v)
  expect(everyTrue).toEqual(true)
})
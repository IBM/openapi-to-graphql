'use strict'

import { beforeAll, describe, test, expect } from '@jest/globals'
import { GraphQLEnumType, GraphQLObjectType, GraphQLSchema } from 'graphql'

import * as openAPIToGraphQL from '../lib/index'
import { Oas3 } from '../lib/types/oas3'

/**
 * Set up the schema first
 */

describe('GraphQL Extensions', () => {
  describe('Schema output', () => {
    let oas: Oas3
    let createdSchema: GraphQLSchema

    beforeAll(async () => {
      oas = require('./fixtures/extensions.json')
      const { schema } = await openAPIToGraphQL.createGraphQLSchema(oas, {
        fillEmptyResponses: true,
        createSubscriptionsFromCallbacks: true
      })
      createdSchema = schema
    })

    test('should rename Query with x-graphql-field-name', () => {
      const queries = Object.keys(createdSchema.getQueryType().getFields())
      expect(queries).not.toContain('petFindByStatus')
      expect(queries).toContain('getPetsByStatus')
    })

    test('should rename Mutation with x-graphql-field-name', () => {
      const mutations = Object.keys(createdSchema.getMutationType().getFields())
      expect(mutations).not.toContain('updatePetWithForm')
      expect(mutations).toContain('updatePetForm')
    })

    test('should rename Subscription with x-graphql-field-name', () => {
      const subscriptions = Object.keys(
        createdSchema.getSubscriptionType().getFields()
      )
      expect(subscriptions).not.toContain('petEventListener')
      expect(subscriptions).toContain('petEvent')
    })

    test('should rename Type with x-graphql-type-name', () => {
      const renamedType = createdSchema.getType('Response')
      expect(renamedType).toBeInstanceOf(GraphQLObjectType)
      expect(createdSchema.getType('ApiResponse')).toBeUndefined()
    })

    test('should rename Type fields with x-graphql-field-name', () => {
      const response = createdSchema.getType('Response') as GraphQLObjectType
      const fields = Object.keys(response.toConfig().fields)
      expect(fields).not.toContain('code')
      expect(fields).toContain('statusCode')
    })

    test('should rename Enum values with x-graphql-enum-mapping', () => {
      const petStatus = createdSchema.getType('PetStatus') as GraphQLEnumType
      const values = petStatus.getValues()
      const initialValue = values.find(({ value }) => value === 'available')
      const pendingValue = values.find(({ value }) => value === 'pending')
      const soldValue = values.find(({ value }) => value === 'sold')
      expect(values.length).toEqual(3)
      expect(initialValue.name).toEqual('INITIAL')
      expect(pendingValue.name).toEqual('IN_PROGRESS')
      expect(soldValue.name).toEqual('SOLD')
    })

    test('should rename Links with x-graphql-field-name', () => {
      const order = createdSchema.getType('Order') as GraphQLObjectType
      const fields = Object.keys(order.getFields())
      expect(fields).not.toContain('pet')
      expect(fields).toContain('orderPet')
      expect(order.getFields().orderPet.type.toString()).toEqual('Pet')
    })
  })

  describe('Error handling', () => {
    test('should throw when x-graphql-type-name causes naming conflicts', async () => {
      const oas = require('./fixtures/extensions_error1.json')
      await expect(
        openAPIToGraphQL.createGraphQLSchema(oas)
      ).rejects.toThrowError(
        new Error(
          'Cannot create Type with name "User".\nYou provided "User" in x-graphql-type-name, but it conflicts with another Type called "User"'
        )
      )
    })

    test('should throw when x-graphql-field-name causes naming conflicts on objects', async () => {
      const oas = require('./fixtures/extensions_error2.json')
      await expect(
        openAPIToGraphQL.createGraphQLSchema(oas)
      ).rejects.toThrowError(
        new Error(
          'Cannot create field with name "name".\nYou provided "name" in x-graphql-field-name, but it conflicts with another field called "name"'
        )
      )
    })

    test('should throw when x-graphql-field-name causes naming conflicts on queries', async () => {
      const oas = require('./fixtures/extensions_error3.json')
      await expect(
        openAPIToGraphQL.createGraphQLSchema(oas)
      ).rejects.toThrowError(
        new Error(
          'Cannot create query with name "user".\nYou provided "user" in x-graphql-field-name, but it conflicts with another query called "user"'
        )
      )
    })

    test('should throw when x-graphql-field-name causes naming conflicts on mutations', async () => {
      const oas = require('./fixtures/extensions_error4.json')
      await expect(
        openAPIToGraphQL.createGraphQLSchema(oas)
      ).rejects.toThrowError(
        new Error(
          'Cannot create mutation with name "createUser".\nYou provided "createUser" in x-graphql-field-name, but it conflicts with another mutation called "createUser"'
        )
      )
    })

    test('should throw when x-graphql-field-name causes naming conflicts on subscriptions', async () => {
      const oas = require('./fixtures/extensions_error5.json')
      await expect(
        openAPIToGraphQL.createGraphQLSchema(oas, {
          createSubscriptionsFromCallbacks: true,
          fillEmptyResponses: true
        })
      ).rejects.toThrowError(
        new Error(
          'Cannot create subscription with name "userEventListener".\nYou provided "userEventListener" in x-graphql-field-name, but it conflicts with another subscription called "userEventListener"'
        )
      )
    })

    test('should throw when x-graphql-field-name causes naming conflicts on links', async () => {
      const oas = require('./fixtures/extensions_error6.json')
      await expect(
        openAPIToGraphQL.createGraphQLSchema(oas)
      ).rejects.toThrowError(
        new Error(
          'Cannot create link with name "group".\nYou provided "group" in x-graphql-field-name, but it conflicts with another link called "group"'
        )
      )
    })

    test('should throw when x-graphql-enum-mapping causes naming conflicts', async () => {
      const oas = require('./fixtures/extensions_error7.json')
      await expect(
        openAPIToGraphQL.createGraphQLSchema(oas)
      ).rejects.toThrowError(
        new Error(
          'Cannot create enum value "CONFLICT".\nYou provided "CONFLICT" in x-graphql-enum-mapping, but it conflicts with another enum value "CONFLICT"'
        )
      )
    })
  })
})

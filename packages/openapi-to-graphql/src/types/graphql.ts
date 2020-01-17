// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

/**
 * Custom type definitions for GraphQL.
 */

import {
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLInputObjectType,
  GraphQLList,
  GraphQLEnumType,
  GraphQLUnionType
} from 'graphql'

export enum GraphQLOperationType {
  Query,
  Mutation,
  Subscription
}

export type GraphQLType =
  | GraphQLObjectType
  | GraphQLInputObjectType
  | GraphQLList<any>
  | GraphQLUnionType
  | GraphQLEnumType
  | GraphQLScalarType

type Arg = {
  type: any
  description?: string
}

export type Args = {
  [key: string]: Arg
}

export type ResolveFunction = (
  root: object,
  args: object,
  ctx: object,
  info: object
) => Promise<any> | any

type SubscriptionContext = {
  pubsub: any
  [key: string]: any
}

export type SubscriptionIterator = (
  root: object,
  args: object,
  ctx: SubscriptionContext,
  info?: object
) => AsyncIterable<string | string[]>

export type ResolveObject = {
  subscribe: SubscriptionIterator
  resolve?: ResolveFunction
}

export type Field = {
  type: GraphQLType
  resolve?: ResolveFunction
  subscribe?: SubscriptionIterator
  args?: Args
  description: string
}

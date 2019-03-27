// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: oasgraph
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
} from 'graphql'

export type GraphQLType = GraphQLScalarType 
  | GraphQLObjectType 
  | GraphQLEnumType 
  | GraphQLInputObjectType 
  | GraphQLList<any>

type Arg = {
  type: any,
  description?: string
}

export type Args = {
  [key: string]: Arg
}

export type ResolveFunction =
  (root: Object, args: Object, ctx: Object) => Promise<any> | any

// export type FieldsType = Thunk<GraphQLFieldConfigMap<Object, Object>>
export type Field = {
  type: GraphQLType,
  resolve?: ResolveFunction,
  args?: Args,
  description: string
}

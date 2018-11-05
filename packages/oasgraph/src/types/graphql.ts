// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: oasgraph
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

/**
 * Custom type definitions for GraphQL.
 */

import {
  GraphQLObjectType as GQObjectType,
  GraphQLScalarType,
  GraphQLInputObjectType as GQInputObjectType,
  GraphQLList as GQList,
  GraphQLEnumType as GQEnumType,
  GraphQLList,
  GraphQLEnumType
} from 'graphql'

export type GraphQLType = GQObjectType
  | GQInputObjectType
  | GraphQLScalarType
  | GQList<any>
  | GQEnumType

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
  type: GQObjectType | GQInputObjectType | GraphQLScalarType |
    GraphQLList<any> | GraphQLEnumType,
  resolve?: ResolveFunction,
  args?: Args,
  description: string
}

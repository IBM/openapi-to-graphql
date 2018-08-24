// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: oasgraph
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

/**
 * Utilities related to GraphQL.
 */

import {
  GraphQLObjectType as GQObjectType,
  GraphQLInputObjectType as GQInputObjectType,
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLString
} from 'graphql'

/**
 * Returns empty GraphQLObjectType.
 */
export function getEmptyObjectType (name: string): GQObjectType {
  return new GraphQLObjectType({
    name: name + 'Placeholder',
    fields: {
      message: {
        type: GraphQLString,
        resolve: () => {
          return 'This interface offers no query.'
        }
      }
    }
  })
}

/**
 * Returns empty GraphQLInputObjectType.
 */
export function getEmptyInputObjectType (): GQInputObjectType {
  return new GraphQLInputObjectType({
    name: 'placeholder',
    fields: {
      message: {
        type: GraphQLString,
        resolve: () => {
          return 'This interface offers no mutation.'
        }
      }
    }
  })
}

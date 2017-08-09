'use strict';

/**
 * Utilities related to GraphQL.
 */

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getEmptyObjectType = getEmptyObjectType;
exports.getEmptyInputObjectType = getEmptyInputObjectType;

var _graphql = require('graphql');

/**
 * Returns empty GraphQLObjectType.
 */
function getEmptyObjectType() {
  return new _graphql.GraphQLObjectType({
    name: 'placeholder',
    fields: {
      message: {
        type: _graphql.GraphQLString,
        resolve: function resolve() {
          return 'This interface offers no query.';
        }
      }
    }
  });
}

/**
 * Returns empty GraphQLInputObjectType.
 */
function getEmptyInputObjectType() {
  return new _graphql.GraphQLInputObjectType({
    name: 'placeholder',
    fields: {
      message: {
        type: _graphql.GraphQLString,
        resolve: function resolve() {
          return 'This interface offers no mutation.';
        }
      }
    }
  });
}
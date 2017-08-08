'use strict';

/**
 * Utilities related to GraphQL.
 */

var _require = require('graphql'),
    GraphQLObjectType = _require.GraphQLObjectType,
    GraphQLInputObjectType = _require.GraphQLInputObjectType,
    GraphQLString = _require.GraphQLString;

var getEmptyObjectType = function getEmptyObjectType() {
  return new GraphQLObjectType({
    name: 'placeholder',
    fields: {
      message: {
        type: GraphQLString,
        resolve: function resolve() {
          return 'This interface offers no query.';
        }
      }
    }
  });
};

var getEmptyInputObjectType = function getEmptyInputObjectType() {
  return new GraphQLInputObjectType({
    name: 'placeholder',
    fields: {
      message: {
        type: GraphQLString,
        resolve: function resolve() {
          return 'This interface offers no mutation.';
        }
      }
    }
  });
};

module.exports = {
  getEmptyObjectType: getEmptyObjectType,
  getEmptyInputObjectType: getEmptyInputObjectType
};
'use strict'

const {
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLString
} = require('graphql')

const getEmptyObjectType = () => {
  return new GraphQLObjectType({
    name: 'placeholder',
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

const getEmptyInputObjectType = () => {
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

module.exports = {
  getEmptyObjectType,
  getEmptyInputObjectType
}

'use strict'

const {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLInputObjectType
} = require('graphql')

let schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'RootMutationType',
    fields: {
      someField: {
        name: 'fieldName',
        type: new GraphQLObjectType({
          name: 'user',
          fields: {
            name: {type: GraphQLString}
          }
        }),
        args: {
          user: {
            'name': 'user',
            'description': 'A user represents a natural person',
            'type': new GraphQLInputObjectType({
              name: 'user',
              fields: {
                name: {type: GraphQLString}
              }
            })
          }
        }
      }
    }
  })
})
// console.log(schema)

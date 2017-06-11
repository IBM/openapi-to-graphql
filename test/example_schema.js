'use strict'

const {
  printSchema,
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLInputObjectType
} = require('graphql')

/**
 * Some lessons learned:
 * - No two (Input) Object Types can have the same name
 * - Field names need to adhere to /^[_a-zA-Z][_a-zA-Z0-9]*$/
 * - (Input) Object Type names need to adhere to /^[_a-zA-Z][_a-zA-Z0-9]*$/
 */

let schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'RootQueryType',
    fields: {
      someField: {
        name: 'fieldName',
        type: new GraphQLObjectType({
          name: 'userObject',
          fields: {
            name: {type: GraphQLString}
          }
        }),
        args: {
          user: {
            'name': 'user',
            'description': 'A user represents a natural person',
            'type': new GraphQLInputObjectType({
              name: 'userInput',
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
console.log(printSchema(schema))

let str = '99this-is-a-()test'
console.log(str.replace(/[^_a-zA-Z0-9]/g, '_'))
console.log(str.replace(/[^_a-zA-Z0-9]/g, '_').replace(/^[0-9]*/g, '_'))

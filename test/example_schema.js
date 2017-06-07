'use strict'

const {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString
} = require('graphql')

const dict = {}

dict.User = new GraphQLObjectType({
  name: 'User',
  fields: () => {
    // programmatically build up fields here...

    let userFields = {
      name: { type: GraphQLString },
      address: {
        type: GraphQLString
      },
      item: {
        type: dict.Item
      }
    }

    return userFields
  }
  // resolve: () => {
  //   return {
  //     name: 'Erik',
  //     address: '270 East 10th street'
  //   }
  // }
})

dict.Item = new GraphQLObjectType({
  name: 'Item',
  fields: () => ({
    id: { type: GraphQLString },
    user: {
      type: dict.User
    }
  })
})

module.exports = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'RootQueryType',
    fields: {
      user: {
        type: dict.User
      }
    }
  })
})

// const User = new GraphQLObjectType({
//   name: 'User',
//   fields: () => ({
//     id: { type: GraphQLString },
//     email: { type: GraphQLString },
//     items: {
//       type: new GraphQLList(Item),
//       resolve: () => { /* resolve function to get user's items */ }
//     }
//   })
// })

// const Item = new GraphQLObjectType({
//   name: 'Item',
//   fields: () => ({
//     id: { type: GraphQLString },
//     name: { type: GraphQLString },
//     user: {
//       type: User,
//       resolve: () => { /* resolve function to get user of item */ }
//     }
//   })
// })

// module.exports = new GraphQLSchema({
//   query: new GraphQLObjectType({
//     name: 'RootQueryType',
//     fields: {
//       user: {
//         type: new GraphQLObjectType({
//           name: 'user',
//           fields: {
//             username: {
//               type: GraphQLString
//             },
//             address: {
//               type: new GraphQLObjectType({
//                 name: 'address',
//                 fields: {
//                   street: {
//                     type: GraphQLString
//                   },
//                   city: {
//                     type: GraphQLString
//                   }
//                 }
//               })
//             },
//             companyId: {
//               type: new GraphQLObjectType({
//                 name: 'companyId',
//                 fields: {
//                   id: {
//                     type: GraphQLString
//                   },
//                   name: {
//                     type: GraphQLString
//                   }
//                 }
//               }),
//               args: {
//                 id: {
//                   type: GraphQLString
//                 }
//               },
//               resolve (root, args, ctx) {
//                 return Promise.resolve({
//                   id: root.companyId,
//                   name: 'test'
//                 })
//               }
//             }
//           }
//         }),
//         resolve (root, args, cxt) {
//           return Promise.resolve({
//             username: 'Erik Wittern',
//             address: {
//               street: 'Hessepark 2',
//               city: 'Hamburg'
//             },
//             companyId: '12345'
//           })
//         }
//       }
//     }
//   })
// })

// let schema = {
//   'type (GraphQLObjectType)': {
//     'name': 'RootQueryType',
//     'fields': {
//       'SomeThing1': {
//         'name': 'SomeThing1',
//         'args': 'Args1',
//         'resolve': 'ResolverFunction',
//         'type (GraphQLObjectType)': {
//           'name': 'SomeThing2',
//           'args': 'Args2',
//           'resolve': 'ResolverFunction',
//           'fields': {

//           }
//         }
//       }
//     }
//   }
// }

// How would a resolve function for a link look like???
// let link = {
//   operationId: 'getCompanyById', // this identifies the resolver...
//   parameters: {
//     id: '$response.body#/employerId'
//   }
// }

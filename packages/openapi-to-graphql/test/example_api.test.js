// Copyright IBM Corp. 2017,2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

/* globals beforeAll, test, expect */

const openapiToGraphql = require('../lib/index.js')
const { graphql, parse, validate } = require('graphql')
const { startServer, stopServer } = require('./example_api_server')

let createdSchema
let oas = require('./fixtures/example_oas.json')
const PORT = 3002
// update PORT for this test case:
oas.servers[0].variables.port.default = String(PORT)

/**
 * Set up the schema first and run example API server
 */
beforeAll(() => {
  return Promise.all([
    openapiToGraphql
      .createGraphQlSchema(oas, {
        addSubOperations: true,
        fillEmptyResponses: true
      })
      .then(({ schema, report }) => {
        createdSchema = schema
      }),
    startServer(PORT)
  ])
})

/**
 * Shut down API server
 */
afterAll(() => {
  return stopServer()
})

test('Get descriptions', () => {
  let query = `{
    __type(name: "Car") {
      name
      fields {
        description
      }
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        __type: {
          name: 'Car',
          fields: [
            {
              description: 'The color of the car.'
            },
            {
              description: 'No description available.'
            },
            {
              description: 'The model of the car.'
            },
            {
              description: 'Arbitrary (string) tags describing an entity.'
            }
          ]
        }
      }
    })
  })
})

test('Get resource (incl. enum)', () => {
  let query = `{
    user (username: "arlene") {
      name
      status
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: { user: { name: 'Arlene L McMahon', status: 'staff' } }
    })
  })
})

test('Get resource 2', () => {
  let query = `{
    company (id: "binsol") {
      legalForm
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({ data: { company: { legalForm: 'public' } } })
  })
})

test('Get resource with status code: 2XX', () => {
  let query = `{
    papers {
      name
      published
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        papers: [
          { name: 'Deliciousness of apples', published: true },
          { name: 'How much coffee is too much coffee?', published: false },
          {
            name: 'How many tennis balls can fit into the average building?',
            published: true
          }
        ]
      }
    })
  })
})

test('Get resource with no response schema and status code: 204 and fillEmptyResponses', () => {
  let query = `{
    bonuses
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        bonuses: ''
      }
    })
  })
})

test('Get nested resource via link $response.body#/...', () => {
  let query = `{
    user (username: "arlene") {
      name
      employerCompany {
        legalForm
      }
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        user: {
          name: 'Arlene L McMahon',
          employerCompany: {
            legalForm: 'public'
          }
        }
      }
    })
  })
})

test('Get nested resource via link $request.path#/... and $request.query#/', () => {
  let query = `{
    productWithId (productId: "123" productTag: "blah") {
      productName
      reviews {
        text
      }
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        productWithId: {
          productName: 'Super Product',
          reviews: [{ text: 'Great product' }, { text: 'I love it' }]
        }
      }
    })
  })
})

test('Get nested resource via link operationRef', () => {
  let query = `{
    productWithId (productId: "123" productTag: "blah") {
      productName
      reviewsWithOperationRef {
        text
      }
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        productWithId: {
          productName: 'Super Product',
          reviewsWithOperationRef: [
            { text: 'Great product' },
            { text: 'I love it' }
          ]
        }
      }
    })
  })
})

test('Get nested lists of resources', () => {
  let query = `{
    user(username: "arlene") {
      name
      friends {
        name
        friends {
          name
          friends {
            name
          }
        }
      }
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        user: {
          name: 'Arlene L McMahon',
          friends: [
            {
              name: 'William B Ropp',
              friends: [
                {
                  name: 'William B Ropp',
                  friends: [
                    {
                      name: 'William B Ropp'
                    },
                    {
                      name: 'John C Barnes'
                    },
                    {
                      name: 'Heather J Tate'
                    }
                  ]
                },
                {
                  name: 'John C Barnes',
                  friends: [
                    {
                      name: 'William B Ropp'
                    },
                    {
                      name: 'John C Barnes'
                    },
                    {
                      name: 'Heather J Tate'
                    }
                  ]
                },
                {
                  name: 'Heather J Tate',
                  friends: [
                    {
                      name: 'William B Ropp'
                    },
                    {
                      name: 'John C Barnes'
                    },
                    {
                      name: 'Heather J Tate'
                    }
                  ]
                }
              ]
            },
            {
              name: 'John C Barnes',
              friends: [
                {
                  name: 'William B Ropp',
                  friends: [
                    {
                      name: 'William B Ropp'
                    },
                    {
                      name: 'John C Barnes'
                    },
                    {
                      name: 'Heather J Tate'
                    }
                  ]
                },
                {
                  name: 'John C Barnes',
                  friends: [
                    {
                      name: 'William B Ropp'
                    },
                    {
                      name: 'John C Barnes'
                    },
                    {
                      name: 'Heather J Tate'
                    }
                  ]
                },
                {
                  name: 'Heather J Tate',
                  friends: [
                    {
                      name: 'William B Ropp'
                    },
                    {
                      name: 'John C Barnes'
                    },
                    {
                      name: 'Heather J Tate'
                    }
                  ]
                }
              ]
            },
            {
              name: 'Heather J Tate',
              friends: [
                {
                  name: 'William B Ropp',
                  friends: [
                    {
                      name: 'William B Ropp'
                    },
                    {
                      name: 'John C Barnes'
                    },
                    {
                      name: 'Heather J Tate'
                    }
                  ]
                },
                {
                  name: 'John C Barnes',
                  friends: [
                    {
                      name: 'William B Ropp'
                    },
                    {
                      name: 'John C Barnes'
                    },
                    {
                      name: 'Heather J Tate'
                    }
                  ]
                },
                {
                  name: 'Heather J Tate',
                  friends: [
                    {
                      name: 'William B Ropp'
                    },
                    {
                      name: 'John C Barnes'
                    },
                    {
                      name: 'Heather J Tate'
                    }
                  ]
                }
              ]
            }
          ]
        }
      }
    })
  })
})

test('Link parameters as constants and variables', () => {
  let query = `{
    scanner(query: "hello") {
      body
      basicLink{
        body
      }
      variableLink{
        body
      }
      constantLink{
        body
      }
      everythingLink{
        body
      }
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        scanner: {
          body: 'hello',
          basicLink: {
            body: 'hello'
          },
          variableLink: {
            body: '_hello_hellohelloabchello123'
          },
          constantLink: {
            body: '123'
          },
          everythingLink: {
            body:
              'http://localhost:3002/api/scanner_get_200_hello_application/json_close'
          }
        }
      }
    })
  })
})

test('Nested links with constants and variables', () => {
  let query = `{
    scanner(query: "val") {
      body
      basicLink{
        body
        basicLink{
          body
          basicLink{
            body
          }
        }
      }
      variableLink{
        body
        constantLink{
          body
          everythingLink{
            body
            everythingLink{
              body
            }
          }
        }
      }
      constantLink{
        body
      }
      everythingLink{
        body
      }
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        scanner: {
          body: 'val',
          basicLink: {
            body: 'val',
            basicLink: {
              body: 'val',
              basicLink: {
                body: 'val'
              }
            }
          },
          variableLink: {
            body: '_val_valvalabcval123',
            constantLink: {
              body: '123',
              everythingLink: {
                body:
                  'http://localhost:3002/api/copier_get_200_123_application/json_close',
                everythingLink: {
                  body:
                    'http://localhost:3002/api/copier_get_200_http://localhost:3002/api/copier_get_200_123_application/json_close_application/json_close'
                }
              }
            }
          },
          constantLink: {
            body: '123'
          },
          everythingLink: {
            body:
              'http://localhost:3002/api/scanner_get_200_val_application/json_close'
          }
        }
      }
    })
  })
})

test('Link parameters as constants and variables with request payload', () => {
  let query = `mutation {
    postScanner(query: "query", path: "path", textPlainInput: "body") {
      body
      everythingLink2 {
        body
      }
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        postScanner: {
          body: 'req.body: body, req.query.query: query, req.path.path: path',
          everythingLink2: {
            body:
              'http://localhost:3002/api/scanner/path_post_200_body_query_path_application/json_req.body: body, req.query.query: query, req.path.path: path_query_path_close'
          }
        }
      }
    })
  })
})

test('Get response without providing parameter with default value', () => {
  let query = `{
    productsReviews (id: "100") {
      text
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        productsReviews: [{ text: 'Great product' }, { text: 'I love it' }]
      }
    })
  })
})

test('Get response with header parameters', () => {
  let query = `{
    snack(snackType: chips, snackSize: small)
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        snack: 'Here is a small chips'
      }
    })
  })
})

// Content-type and accept headers should not change because they are linked
// to GraphQL object types with static schemas
test('Get JSON response even with non-JSON accept header', () => {
  let query = `{
    office (id: 2) {
      employerId
      roomNumber,
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        office: {
          employerId: 'binsol',
          roomNumber: 102
        }
      }
    })
  })
})

test('Get response with cookies', () => {
  let query = `{
    cookie (cookieType:chocolateChip, cookieSize:megaSized)
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        cookie:
          'Thanks for your cookie preferences: "cookie_type=chocolate chip; cookie_size=mega-sized; "'
      }
    })
  })
})

test('Ensure good naming for operations with duplicated schemas', () => {
  let query = `query {
    cleanDesks
    dirtyDesks
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        cleanDesks: '5 clean desks',
        dirtyDesks: '5 dirty desks'
      }
    })
  })
})

test('Get response containing 64 bit integer (using GraphQLFloat)', () => {
  let query = `{
    productsReviews (id: "100") {
      timestamp
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        productsReviews: [
          { timestamp: 1502787600000000 },
          { timestamp: 1502787400000000 }
        ]
      }
    })
  })
})

test('Get array of strings', () => {
  let query = `{
    user (username: "arlene") {
      hobbies
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        user: {
          hobbies: ['tap dancing', 'bowling']
        }
      }
    })
  })
})

test('Get array of objects', () => {
  let query = `{
    company (id: "binsol") {
      offices{
        street
      }
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        company: {
          offices: [
            {
              street: '122 Elk Rd Little'
            },
            {
              street: '124 Elk Rd Little'
            }
          ]
        }
      }
    })
  })
})

test('Get single resource', () => {
  let query = `{
    user(username: "arlene"){
      name
      address{
        street
      },
      address2{
        city
      }
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        user: {
          name: 'Arlene L McMahon',
          address: {
            street: '4656 Cherry Camp Road'
          },
          address2: {
            city: 'Macomb'
          }
        }
      }
    })
  })
})

test('Post resource', () => {
  let query = `mutation {
    postUser (userInput: {
      name: "Mr. New Guy"
      address: {
        street: "Home streeet 1"
        city: "Hamburg"
      }
      employerId: "binsol"
      hobbies: "soccer"
    }) {
      name
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        postUser: {
          name: 'Mr. New Guy'
        }
      }
    })
  })
})

test('Post resource and get nested resource back', () => {
  let query = `mutation {
    postUser (userInput: {
      name: "Mr. New Guy"
      address: {
        street: "Home streeet 1"
        city: "Hamburg"
      }
      employerId: "binsol"
      hobbies: "soccer"
    }) {
      name
      employerCompany {
        ceoUser {
          name
        }
      }
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        postUser: {
          name: 'Mr. New Guy',
          employerCompany: {
            ceoUser: {
              name: 'John C Barnes'
            }
          }
        }
      }
    })
  })
})

test('Post resource with non-application/json content-type request and response bodies', () => {
  let query = `mutation{postPaper(textPlainInput: "happy")}`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        postPaper: 'You sent the paper idea: happy'
      }
    })
  })
})

test(
  'Operation id is correctly sanitized, schema names and fields are ' +
    'correctly sanitized, path and query parameters are correctly sanitized, ' +
    'received data is correctly sanitized',
  () => {
    let query = `{
    productWithId (productId: "this-path", productTag:"And a tag") {
      productId
      productTag
    }
  }`
    return graphql(createdSchema, query).then(result => {
      expect(result).toEqual({
        data: {
          productWithId: {
            productId: 'this-path',
            productTag: 'And a tag'
          }
        }
      })
    })
  }
)

test('Request data is correctly de-sanitized to be sent', () => {
  let query = `mutation {
    postProductWithId (productWithIdInput: {
      productName: "Soccer ball"
      productId: "ball123"
      productTag:"sports"
    }) {
      productName
      productId
      productTag
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        postProductWithId: {
          productName: 'Soccer ball',
          productId: 'ball123',
          productTag: 'sports'
        }
      }
    })
  })
})

test('Fields with arbitrary JSON (e.g., maps) can be returned', () => {
  let query = `{
    car (username: "arlene") {
      color
      model
      tags
    }
  }`
  return graphql(createdSchema, query, null, {}).then(result => {
    expect(result).toEqual({
      data: {
        car: {
          color: 'black',
          model: 'BMW 7 series',
          tags: {
            impression: 'decadent'
          }
        }
      }
    })
  })
})

test('Capitalized enum values can be returned', () => {
  let query = `{
    car (username: "arlene") {
      kind
    }
  }`
  return graphql(createdSchema, query, null, {}).then(result => {
    expect(result).toEqual({
      data: {
        car: {
          kind: 'LIMOSINE'
        }
      }
    })
  })
})

test('Define header and query options', () => {
  let options = {
    headers: {
      exampleHeader: 'some-value'
    },
    qs: {
      limit: 30
    }
  }
  let query = `{
    status2 (globalquery: "test")
  }`
  return openapiToGraphql
    .createGraphQlSchema(oas, options)
    .then(({ schema }) => {
      // validate that 'limit' parameter is covered by options:
      let ast = parse(query)
      let errors = validate(schema, ast)
      expect(errors).toEqual([])
      return graphql(schema, query).then(result => {
        expect(result).toEqual({
          data: {
            status2: 'Ok.'
          }
        })
      })
    })
})

test('Resolve allOf', () => {
  let query = `{
    user (username: "arlene") {
      name
      nomenclature {
        suborder
        family
        genus
        species
      }
    }
  }`
  return graphql(createdSchema, query, null, {}).then(result => {
    expect(result).toEqual({
      data: {
        user: {
          name: 'Arlene L McMahon',
          nomenclature: {
            suborder: 'Haplorhini',
            family: 'Hominidae',
            genus: 'Homo',
            species: 'sapiens'
          }
        }
      }
    })
  })
})

test('Error contains extension', () => {
  let query = `query {
    user(username: "abcdef") {
      name
    }
  }`
  return graphql(createdSchema, query, null, {}).then(error => {
    const extensions = error.errors[0].extensions
    expect(extensions).toBeDefined()

    // Remove headers because it contains fields that may change from run to run
    delete extensions.responseHeaders
    expect(extensions).toEqual({
      method: 'get',
      path: '/users/{username}',
      statusCode: 404,
      responseBody: {
        message: 'Wrong username.'
      }
    })
  })
})

test('Option provideErrorExtensions should prevent error extensions from being created', () => {
  let options = {
    provideErrorExtensions: false
  }
  let query = `query {
    user(username: "abcdef") {
      name
    }
  }`
  return openapiToGraphql
    .createGraphQlSchema(oas, options)
    .then(({ schema }) => {
      let ast = parse(query)
      let errors = validate(schema, ast)
      expect(errors).toEqual([])
      return graphql(schema, query).then(result => {
        expect(result).toEqual({
          errors: [
            {
              message: 'Could not invoke operation GET /users/{username}',
              locations: [
                {
                  line: 2,
                  column: 5
                }
              ],
              path: ['user']
            }
          ],
          data: {
            user: null
          }
        })
      })
    })
})

test('Option customResolver', () => {
  let options = {
    customResolvers: {
      'Example API': {
        '/users/{username}': {
          get: () => {
            return {
              name: 'Jenifer Aldric'
            }
          }
        }
      }
    }
  }
  let query = `query {
    user(username: "abcdef") {
      name
    }
  }`
  return openapiToGraphql
    .createGraphQlSchema(oas, options)
    .then(({ schema }) => {
      let ast = parse(query)
      let errors = validate(schema, ast)
      expect(errors).toEqual([])
      return graphql(schema, query).then(result => {
        expect(result).toEqual({
          data: {
            user: {
              name: 'Jenifer Aldric'
            }
          }
        })
      })
    })
})

test('Option customResolver with links', () => {
  let options = {
    customResolvers: {
      'Example API': {
        '/users/{username}': {
          get: () => {
            return {
              name: 'Jenifer Aldric',
              employerId: 'binsol'
            }
          }
        }
      }
    }
  }
  let query = `query {
    user(username: "abcdef") {
      name
      employerId
      employerCompany {
        name
        ceoUsername 
        ceoUser {
          name
        }
      }
    }
  }`
  return openapiToGraphql
    .createGraphQlSchema(oas, options)
    .then(({ schema }) => {
      let ast = parse(query)
      let errors = validate(schema, ast)
      expect(errors).toEqual([])
      return graphql(schema, query).then(result => {
        expect(result).toEqual({
          data: {
            user: {
              name: 'Jenifer Aldric',
              employerId: 'binsol',
              employerCompany: {
                name: 'Binary Solutions',
                ceoUsername: 'johnny',
                ceoUser: {
                  name: 'Jenifer Aldric'
                }
              }
            }
          }
        })
      })
    })
})

test('Option customResolver using resolver arguments', () => {
  let options = {
    customResolvers: {
      'Example API': {
        '/users/{username}': {
          get: (obj, args, context, info) => {
            return {
              name: args.username
            }
          }
        }
      }
    }
  }
  let query = `query {
    user(username: "abcdef") {
      name
    }
  }`
  return openapiToGraphql
    .createGraphQlSchema(oas, options)
    .then(({ schema }) => {
      let ast = parse(query)
      let errors = validate(schema, ast)
      expect(errors).toEqual([])
      return graphql(schema, query).then(result => {
        expect(result).toEqual({
          data: {
            user: {
              name: 'abcdef'
            }
          }
        })
      })
    })
})

test('Option customResolver using resolver arguments that are sanitized', () => {
  let options = {
    customResolvers: {
      'Example API': {
        '/products/{product-id}': {
          get: (obj, args, context, info) => {
            console.log(args)
            return {
              // Note that the argument name is sanitized
              productName: 'abcdef'
            }
          }
        }
      }
    }
  }
  let query = `{
    productWithId (productId: "123" productTag: "blah") {
      productName
    }
  }`
  return openapiToGraphql
    .createGraphQlSchema(oas, options)
    .then(({ schema }) => {
      let ast = parse(query)
      let errors = validate(schema, ast)
      expect(errors).toEqual([])
      return graphql(schema, query).then(result => {
        expect(result).toEqual({
          data: {
            productWithId: {
              productName: 'abcdef'
            }
          }
        })
      })
    })
})

test('Option addLimitArgument', () => {
  let options = {
    addLimitArgument: true
  }
  let query = `query {
    user(username: "arlene") {
      name
      friends (limit: 3) {
        name
        friends (limit: 2) {
          name
          friends (limit: 1) {
            name
          }
        }
      }
    }
  }`
  return openapiToGraphql
    .createGraphQlSchema(oas, options)
    .then(({ schema }) => {
      let ast = parse(query)
      let errors = validate(schema, ast)
      expect(errors).toEqual([])
      return graphql(schema, query).then(result => {
        expect(result).toEqual({
          data: {
            user: {
              name: 'Arlene L McMahon',
              friends: [
                {
                  name: 'William B Ropp',
                  friends: [
                    {
                      name: 'William B Ropp',
                      friends: [
                        {
                          name: 'William B Ropp'
                        }
                      ]
                    },
                    {
                      name: 'John C Barnes',
                      friends: [
                        {
                          name: 'William B Ropp'
                        }
                      ]
                    }
                  ]
                },
                {
                  name: 'John C Barnes',
                  friends: [
                    {
                      name: 'William B Ropp',
                      friends: [
                        {
                          name: 'William B Ropp'
                        }
                      ]
                    },
                    {
                      name: 'John C Barnes',
                      friends: [
                        {
                          name: 'William B Ropp'
                        }
                      ]
                    }
                  ]
                },
                {
                  name: 'Heather J Tate',
                  friends: [
                    {
                      name: 'William B Ropp',
                      friends: [
                        {
                          name: 'William B Ropp'
                        }
                      ]
                    },
                    {
                      name: 'John C Barnes',
                      friends: [
                        {
                          name: 'William B Ropp'
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          }
        })
      })
    })
})

test('Content property in parameter object', () => {
  let query = `{
    coordinates(lat: 3, long: 5) {
      lat,
      long
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        coordinates: {
          lat: 8,
          long: 10
        }
      }
    })
  })
})

test('Stringify objects without defined properties', () => {
  let query = `{
    trashcan(username:"arlene") {
      brand,
      contents
    }
    trashcans {
      contents
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        trashcan: {
          brand: '"Garbage Emporium"',
          contents: [
            '{"type":"apple","message":"Half-eaten"}',
            '{"type":"sock","message":"Lost one"}'
          ]
        },
        trashcans: [
          {
            contents: [
              '{"type":"apple","message":"Half-eaten"}',
              '{"type":"sock","message":"Lost one"}'
            ]
          },
          {
            contents: ['{"type":"sock","message":"Lost one"}']
          },
          {
            contents: []
          },
          {
            contents: ['{"type":"tissue","message":"Used"}']
          }
        ]
      }
    })
  })
})

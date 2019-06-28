// Copyright IBM Corp. 2017,2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

/* globals beforeAll, test, expect */

const openapiToGraphql = require('../lib/index.js')
const { graphql, parse, validate } = require('graphql')
const api = require('./example_api_server')
const api2 = require('./example_api3_server')

let createdSchema
let oas = require('./fixtures/example_oas.json')
let oas3 = require('./fixtures/example_oas3.json')
const PORT = 3005
const PORT2 = 3006
// update PORT for this test case:
oas.servers[0].variables.port.default = String(PORT)
oas3.servers[0].variables.port.default = String(PORT2)

/**
 * Set up the schema first and run example API server
 */
beforeAll(() => {
  return Promise.all([
    openapiToGraphql
      .createGraphQlSchema([oas, oas3], {
        addSubOperations: true,
        fillEmptyResponses: true
      })
      .then(({ schema, report }) => {
        createdSchema = schema
      }),
    api.startServer(PORT),
    api2.startServer(PORT2)
  ])
})

/**
 * Shut down API server
 */
afterAll(() => {
  return Promise.all([api.stopServer(), api2.stopServer()])
})

test('Basic query on two APIs', () => {
  let query = `query{
    author(authorId: "arlene"){
      name
    },
    book(bookId: "software") {
      title
    },
    user(username: "arlene") {
      name
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        author: {
          name: 'Arlene L McMahon'
        },
        book: {
          title: 'The OpenAPI-to-GraphQL Cookbook'
        },
        user: {
          name: 'Arlene L McMahon'
        }
      }
    })
  })
})

test('Two APIs with independent links', () => {
  let query = `query {
    author(authorId: "arlene") {
      name
      masterpieceTitle,
      masterpiece {
        title
      }
    },
    book(bookId: "software") {
      title
      authorName
      author {
        name
        masterpiece {
          author {
            name
          }
        }
      }
    },
    user(username: "arlene") {
      name
      employerCompany {
        name
      }
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        author: {
          name: 'Arlene L McMahon',
          masterpieceTitle: 'software',
          masterpiece: {
            title: 'The OpenAPI-to-GraphQL Cookbook'
          }
        },
        book: {
          title: 'The OpenAPI-to-GraphQL Cookbook',
          authorName: 'arlene',
          author: {
            name: 'Arlene L McMahon',
            masterpiece: {
              author: {
                name: 'Arlene L McMahon'
              }
            }
          }
        },
        user: {
          name: 'Arlene L McMahon',
          employerCompany: {
            name: 'Binary Solutions'
          }
        }
      }
    })
  })
})

test('Two APIs with interrelated links', () => {
  let query = `query {
    author(authorId: "arlene") {
      name
      employee{
        name
        employerCompany{
          name
        }
        author{
          name
          masterpiece{
            title
            author{
              name
              employee{
                name
              }
            }
          }
        }
      }
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        author: {
          name: 'Arlene L McMahon',
          employee: {
            name: 'Arlene L McMahon',
            employerCompany: {
              name: 'Binary Solutions'
            },
            author: {
              name: 'Arlene L McMahon',
              masterpiece: {
                title: 'The OpenAPI-to-GraphQL Cookbook',
                author: {
                  name: 'Arlene L McMahon',
                  employee: {
                    name: 'Arlene L McMahon'
                  }
                }
              }
            }
          }
        }
      }
    })
  })
})

test('Two APIs with viewers', () => {
  let query = `query {
    viewerApiKey (apiKey: "abcdef"){
      nextWork(authorId: "arlene") {
        title
        author {
          name
        }
      }
    }
    viewerBasicAuth2 (username: "arlene123", password: "password123") {
      patent (patentId: "100") {
        patentId
      }
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        viewerApiKey: {
          nextWork: {
            title: 'OpenAPI-to-GraphQL for Power Users',
            author: {
              name: 'Arlene L McMahon'
            }
          }
        },
        viewerBasicAuth2: {
          patent: {
            patentId: '100'
          }
        }
      }
    })
  })
})

test('Two APIs with AnyAuth viewer', () => {
  let query = `{ 
    viewerAnyAuth(exampleApiKeyProtocol2: {apiKey: "abcdef"}, exampleApi3BasicProtocol: {username: "arlene123", password: "password123"}) {
      project(projectId: 1) {
        projectLead{
          name
        }
      }
      nextWork(authorId: "arlene") {
        title
      }
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        viewerAnyAuth: {
          project: {
            projectLead: {
              name: 'Arlene L McMahon'
            }
          },
          nextWork: {
            title: 'OpenAPI-to-GraphQL for Power Users'
          }
        }
      }
    })
  })
})

test('Two APIs with AnyAuth viewer and interrelated links', () => {
  let query = `{ 
    viewerAnyAuth(exampleApiKeyProtocol2: {apiKey: "abcdef"}, exampleApi3BasicProtocol: {username: "arlene123", password: "password123"}) {
      project(projectId: 1) {
        projectLead{
          name
          author {
            name
            nextWork {
              title
            }
          }
        }
      }
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      data: {
        viewerAnyAuth: {
          project: {
            projectLead: {
              name: 'Arlene L McMahon',
              author: {
                name: 'Arlene L McMahon',
                nextWork: {
                  title: 'OpenAPI-to-GraphQL for Power Users'
                }
              }
            }
          }
        }
      }
    })
  })
})

test('Option customResolver with two APIs', () => {
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
      },
      'Example API 3': {
        '/authors/{authorId}': {
          get: () => {
            return {
              name: 'Jenifer Aldric, the author'
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
    author(authorId: "abcdef") {
      name
    }
  }`
  return openapiToGraphql
    .createGraphQlSchema([oas, oas3], options)
    .then(({ schema }) => {
      let ast = parse(query)
      let errors = validate(schema, ast)
      expect(errors).toEqual([])
      return graphql(schema, query).then(result => {
        expect(result).toEqual({
          data: {
            user: {
              name: 'Jenifer Aldric'
            },
            author: {
              name: 'Jenifer Aldric, the author'
            }
          }
        })
      })
    })
})

test('Option customResolver with two APIs and interrelated links', () => {
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
      },
      'Example API 3': {
        '/authors/{authorId}': {
          get: () => {
            return {
              name: 'Jenifer Aldric, the author',
              masterpieceTitle: 'A collection of stories'
            }
          }
        },
        '/books/{bookId}': {
          get: () => {
            return {
              title: 'A collection of stories for babies',
              authorName: 'Jenifer Aldric, yet another author'
            }
          }
        }
      }
    }
  }
  let query = `query {
    author(authorId: "abcdef") {
      name
      employee{
        name
        employerCompany{
          name
        }
        author{
          name
          masterpiece{
            title
            author{
              name
              employee{
                name
              }
            }
          }
        }
      }
    }
  }`
  return openapiToGraphql
    .createGraphQlSchema([oas, oas3], options)
    .then(({ schema }) => {
      let ast = parse(query)
      let errors = validate(schema, ast)
      expect(errors).toEqual([])
      return graphql(schema, query).then(result => {
        expect(result).toEqual({
          data: {
            author: {
              name: 'Jenifer Aldric, the author',
              employee: {
                name: 'Jenifer Aldric',
                employerCompany: {
                  name: 'Binary Solutions'
                },
                author: {
                  name: 'Jenifer Aldric, the author',
                  masterpiece: {
                    title: 'A collection of stories for babies',
                    author: {
                      name: 'Jenifer Aldric, the author',
                      employee: {
                        name: 'Jenifer Aldric'
                      }
                    }
                  }
                }
              }
            }
          }
        })
      })
    })
})

// Copyright IBM Corp. 2017,2018. All Rights Reserved.
// Node module: oasgraph
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

/* globals beforeAll, test, expect */

const OasGraph = require('../lib/index.js')
const {
  graphql,
  parse,
  validate
} = require('graphql')
const api = require('./example_api_server')
const api2 = require('./example_api3_server')

let createdSchema
let oas = require('./fixtures/example_oas.json')
let oas2 = require('./fixtures/example_oas3.json')
const PORT = 3005
const PORT2 = 3006
// update PORT for this test case:
oas.servers[0].variables.port.default = String(PORT)
oas2.servers[0].variables.port.default = String(PORT2)

/**
 * Set up the schema first and run example API server
 */
beforeAll(() => {
  return Promise.all([
    OasGraph.createGraphQlSchema([oas, oas2], {
      addSubOperations: true,
      fillEmptyResponses: true
    })
    .then(({schema, report}) => {
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
      "data": {
        "author": {
          "name": "Arlene L McMahon"
        },
        "book": {
          "title": "The OASGraph Cookbook"
        },
        "user": {
          "name": "Arlene L McMahon"
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
      "data": {
        "author": {
          "name": "Arlene L McMahon",
          "masterpieceTitle": "software",
          "masterpiece": {
            "title": "The OASGraph Cookbook"
          }
        },
        "book": {
          "title": "The OASGraph Cookbook",
          "authorName": "arlene",
          "author": {
            "name": "Arlene L McMahon",
            "masterpiece": {
              "author": {
                "name": "Arlene L McMahon"
              }
            }
          }
        },
        "user": {
          "name": "Arlene L McMahon",
          "employerCompany": {
            "name": "Binary Solutions"
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
      "data": {
        "author": {
          "name": "Arlene L McMahon",
          "employee": {
            "name": "Arlene L McMahon",
            "employerCompany": {
              "name": "Binary Solutions"
            },
            "author": {
              "name": "Arlene L McMahon",
              "masterpiece": {
                "title": "The OASGraph Cookbook",
                "author": {
                  "name": "Arlene L McMahon",
                  "employee": {
                    "name": "Arlene L McMahon"
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
      patentWithId (patentId: "100") {
        patentId
      }
    }
  }`
  return graphql(createdSchema, query).then(result => {
    expect(result).toEqual({
      "data": {
        "viewerApiKey": {
          "nextWork": {
            "title": "OASGraph for Power Users",
            "author": {
              "name": "Arlene L McMahon"
            }
          }
        },
        "viewerBasicAuth2": {
          "patentWithId": {
            "patentId": "100"
          }
        }
      }
    })
  })
})

test('Two APIs with AnyAuth viewer', () => {
  let query = `{ 
    viewerAnyAuth(exampleApiKeyProtocol2: {apiKey: "abcdef"}, exampleApi3BasicProtocol: {username: "arlene123", password: "password123"}) {
      projectWithId(projectId: 1) {
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
      "data": {
        "viewerAnyAuth": {
          "projectWithId": {
            "projectLead": {
              "name": "Arlene L McMahon"
            }
          },
          "nextWork": {
            "title": "OASGraph for Power Users"
          }
        }
      }
    })
  })
})

test('Two APIs with AnyAuth viewer and interrelated links', () => {
  let query = `{ 
    viewerAnyAuth(exampleApiKeyProtocol2: {apiKey: "abcdef"}, exampleApi3BasicProtocol: {username: "arlene123", password: "password123"}) {
      projectWithId(projectId: 1) {
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
      "data": {
        "viewerAnyAuth": {
          "projectWithId": {
            "projectLead": {
              "name": "Arlene L McMahon",
              "author": {
                "name": "Arlene L McMahon",
                "nextWork": {
                  "title": "OASGraph for Power Users"
                }
              }
            }
          }
        }
      }
    })
  })
})
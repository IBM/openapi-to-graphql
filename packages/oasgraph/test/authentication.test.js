// Copyright IBM Corp. 2017,2018. All Rights Reserved.
// Node module: oasgraph
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

/* globals beforeAll, test, expect */

const OasGraph = require('../lib/index.js')
const {
  graphql
} = require('graphql')

let oas = require('./fixtures/example_oas.json')
const PORT = 3003
// update PORT for this test case:
oas.servers[0].variables.port.default = String(PORT)
const { startServer, stopServer } = require('./example_api_server')

let createdSchema

/**
 * Set up the schema first and run example API server
 */
beforeAll(() => {
  return Promise.all([
    OasGraph.createGraphQlSchema(oas)
      .then(({ schema }) => {
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

test('Get patent using basic auth', () => {
  let query = `{
    viewerBasicAuth (username: "arlene123", password: "password123") {
      patentWithId (patentId: "100") {
        patentId
      }
    }
  }`
  return graphql(createdSchema, query, null, {}).then(result => {
    expect(result).toEqual({
      'data': {
        'viewerBasicAuth': {
          'patentWithId': {
            'patentId': '100'
          }
        }
      }
    })
  })
})

test('Get patent using API key', () => {
  let query = `{
    viewerApiKey2 (apiKey: "abcdef") {
      patentWithId (patentId: "100") {
        patentId
      }
    }
  }`
  return graphql(createdSchema, query, null, {}).then(result => {
    expect(result).toEqual({
      'data': {
        'viewerApiKey2': {
          'patentWithId': {
            'patentId': '100'
          }
        }
      }
    })
  })
})

test('Get project using API key 1', () => {
  let query = `{
    viewerApiKey (apiKey: "abcdef") {
      projectWithId (projectId: 1) {
        active
        projectId
      }
    }
  }`
  return graphql(createdSchema, query, null, {}).then(result => {
    expect(result).toEqual({
      data: {
        viewerApiKey: {
          projectWithId: {
            active: true,
            projectId: 1
          }
        }
      }
    })
  })
})

test('Get project using API key passed as option - viewer is disabled', async () => {
  let { schema } = await OasGraph.createGraphQlSchema(oas, {
    viewer: false,
    headers: {
      access_token: 'abcdef'
    }
  })
  let query = `{
    projectWithId (projectId: 1) {
      projectId
    }
  }`
  return graphql(schema, query, null, {}).then(result => {
    expect(result).toEqual({
      data: {
        projectWithId: {
          projectId: 1
        }
      }
    })
  })
})

test('Get project using API key passed in the requestOptions - viewer is disabled', async () => {
  let { schema } = await OasGraph.createGraphQlSchema(oas, {
    viewer: false,
    requestOptions: {
      headers: {
        access_token: 'abcdef'
      }
    }
  })
  let query = `{
    projectWithId (projectId: 1) {
      projectId
    }
  }`
  return graphql(schema, query, null, {}).then(result => {
    expect(result).toEqual({
      data: {
        projectWithId: {
          projectId: 1
        }
      }
    })
  })
})

test('Get project using API key 2', () => {
  let query = `{
    viewerApiKey2 (apiKey: "abcdef") {
      projectWithId (projectId: 1) {
        projectId
      }
    }
  }`
  return graphql(createdSchema, query, null, {}).then(result => {
    expect(result).toEqual({
      data: {
        viewerApiKey2: {
          projectWithId: {
            projectId: 1
          }
        }
      }
    })
  })
})

test('Post project using API key 1', () => {
  let query = `mutation {
    mutationViewerApiKey (apiKey: "abcdef") {
      postProjectWithId (projectWithIdInput: {
        projectId: 123
        leadId: "arlene"
      }) {
        projectLead {
          name
        }
      }
    }
  }`
  return graphql(createdSchema, query, null, {}).then(result => {
    expect(result).toEqual({
      data: {
        mutationViewerApiKey: {
          postProjectWithId: {
            projectLead: {
              name: 'Arlene L McMahon'
            }
          }
        }
      }
    })
  })
})

test('Post project using API key 2', () => {
  let query = `mutation {
    mutationViewerApiKey2 (apiKey: "abcdef") {
      postProjectWithId (projectWithIdInput: {
        projectId: 123
        leadId: "arlene"
      }) {
        projectLead {
          name
        }
      }
    }
  }`
  return graphql(createdSchema, query, null, {}).then(result => {
    expect(result).toEqual({
      data: {
        mutationViewerApiKey2: {
          postProjectWithId: {
            projectLead: {
              name: 'Arlene L McMahon'
            }
          }
        }
      }
    })
  })
})

test('Basic AnyAuth usage', () => {
  let query = `{ 
    viewerAnyAuth(exampleApiBasicProtocol: {username: "arlene123", password: "password123"}) {
      patentWithId (patentId: "100") {
        patentId
      }
    }
  }`
  return graphql(createdSchema, query, null, {}).then(result => {
    expect(result).toEqual({
      "data": {
        "viewerAnyAuth": {
          "patentWithId": {
            "patentId": "100"
          }
        }
      }
    })
  })
})

test('Basic AnyAuth usage with extraneous auth data', () => {
  let query = `{ 
    viewerAnyAuth(exampleApiKeyProtocol: {apiKey: "abcdef"}, exampleApiBasicProtocol: {username: "arlene123", password: "password123"}) {
      patentWithId (patentId: "100") {
        patentId
      }
    }
  }`
  return graphql(createdSchema, query, null, {}).then(result => {
    expect(result).toEqual({
      "data": {
        "viewerAnyAuth": {
          "patentWithId": {
            "patentId": "100"
          }
        }
      }
    })
  })
})

test('Basic AnyAuth usage with multiple operations', () => {
  let query = `{ 
    viewerAnyAuth(exampleApiKeyProtocol2: {apiKey: "abcdef"}) {
      patentWithId (patentId: "100") {
        patentId
      }
      projectWithId (projectId: 1) {
        projectId
      }
    }
  }`
  return graphql(createdSchema, query, null, {}).then(result => {
    expect(result).toEqual({
      "data": {
        "viewerAnyAuth": {
          "patentWithId": {
            "patentId": "100"
          },
          "projectWithId": {
            "projectId": 1
          }
        }
      }
    })
  })
})

test('AnyAuth with multiple operations with different auth requirements', () => {
  let query = `{ 
    viewerAnyAuth(exampleApiBasicProtocol: {username: "arlene123", password: "password123"}, exampleApiKeyProtocol: {apiKey: "abcdef"}) {
      patentWithId (patentId: "100") {
        patentId
      }
      projectWithId (projectId: 1) {
        projectId
      }
    }
  }`
  return graphql(createdSchema, query, null, {}).then(result => {
    expect(result).toEqual({
      "data": {
        "viewerAnyAuth": {
          "patentWithId": {
            "patentId": "100"
          },
          "projectWithId": {
            "projectId": 1
          }
        }
      }
    })
  })
})

// This request can only be fulfilled using AnyAuth
test('AnyAuth with multiple operations with different auth requirements in a link', () => {
  let query = `{ 
    viewerAnyAuth(exampleApiBasicProtocol: {username: "arlene123", password: "password123"}, exampleApiKeyProtocol: {apiKey: "abcdef"}) {
      projectWithId (projectId: 3) {
        projectId
        patentId
        patent {
          patentId
        }
        projectLead {
          name
        }
      }
    }
  }`
  return graphql(createdSchema, query, null, {}).then(result => {
    expect(result).toEqual({
      "data": {
        "viewerAnyAuth": {
          "projectWithId": {
            "projectId": 3,
            "patentId": "100",
            "patent": {
              "patentId": "100"
            },
            "projectLead": {
              "name": "William B Ropp"
            }
          }
        }
      }
    })
  })
})

test('Extract token from context', () => {
  let query = `{
    secure
  }`

  return OasGraph.createGraphQlSchema(oas, { tokenJSONpath: '$.user.token', viewer: true })
    .then(({ schema }) => {
      return graphql(schema, query, null, { user: { token: 'abcdef' } }).then(result => {
        expect(result).toEqual({
          'data': {
            secure: 'A secure message.'
          }
        })
      })
    })
})

'use strict'

/* globals beforeAll, test, expect */

/**
 * Precondition: run `node test/example_api_server.js`
 */

const OasGraph = require('../lib/index.js')
const {
  graphql
} = require('graphql')

/**
 * Set up the schema first
 */
let oas = require('./fixtures/example_oas.json')
let schema
beforeAll(() => {
  return OasGraph.createGraphQlSchema(oas)
    .then(createdSchema => {
      schema = createdSchema
    })
})

test('Get patent using basic auth', () => {
  let query = `{
    viewerBasicAuth (username: "erik123", password: "password123") {
      patentWithId (patentId: "100") {
        patentId
      }
    }
  }`
  return graphql(schema, query, null, {}).then(result => {
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
    viewerApiKey (apiKey: "abcdef") {
      patentWithId (patentId: "100") {
        patentId
      }
    }
  }`
  return graphql(schema, query, null, {}).then(result => {
    expect(result).toEqual({
      'data': {
        'viewerApiKey': {
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
      projectWithId (projectId: "1") {
        projectId
      }
    }
  }`
  return graphql(schema, query, null, {}).then(result => {
    expect(result).toEqual({
      'data': {
        'viewerApiKey': {
          'projectWithId': {
            'projectId': '1'
          }
        }
      }
    })
  })
})

test('Get project using API key 2', () => {
  let query = `{
    viewerApiKey2 (apiKey: "abcdef") {
      projectWithId (projectId: "1") {
        projectId
      }
    }
  }`
  return graphql(schema, query, null, {}).then(result => {
    expect(result).toEqual({
      'data': {
        'viewerApiKey2': {
          'projectWithId': {
            'projectId': '1'
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
        projectId: "123"
        leadId: "erik"
      }) {
        projectLead {
          name
        }
      }
    }
  }`
  return graphql(schema, query, null, {}).then(result => {
    expect(result).toEqual({
      'data': {
        'mutationViewerApiKey': {
          'postProjectWithId': {
            'projectLead': {
              'name': 'Erik Wittern'
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
        projectId: "123"
        leadId: "erik"
      }) {
        projectLead {
          name
        }
      }
    }
  }`
  return graphql(schema, query, null, {}).then(result => {
    expect(result).toEqual({
      'data': {
        'mutationViewerApiKey2': {
          'postProjectWithId': {
            'projectLead': {
              'name': 'Erik Wittern'
            }
          }
        }
      }
    })
  })
})

test('Extract token from context', () => {
  let query = `{
    Secure
  }`

  return OasGraph.createGraphQlSchema(oas, {tokenJSONpath: '$.user.token', viewer: true})
    .then(createdSchema => {
      return graphql(createdSchema, query, null, {user: {token: 'abcdef'}}).then(result => {
        expect(result).toEqual({
          'data': {
            Secure: 'A secure message.'
          }
        })
      })
    })
})

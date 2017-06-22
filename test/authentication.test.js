'use strict'

/* globals beforeAll, test, expect */

/**
 * Precondition: run `node test/example_api_server.js`
 */

const OasGraph = require('../index.js')
const {
  graphql
} = require('graphql')

/**
 * Set up the schema first
 */
let schema
beforeAll(() => {
  let oas = require('./fixtures/example_oas.json')
  return OasGraph.createGraphQlSchema(oas)
    .then(createdSchema => {
      schema = createdSchema
    })
})

test('Get patent using basic auth', () => {
  let query = `{
    viewerHttp (username: "erik123", password: "password123") {
      patentWithId (patentId: "100") {
        patentId
      }
    }
  }`
  return graphql(schema, query, null, {}).then(result => {
    expect(result).toEqual({
      'data': {
        'viewerHttp': {
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

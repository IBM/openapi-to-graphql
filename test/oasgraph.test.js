'use strict'

/* globals beforeAll, test, expect */

/**
 * Precondition: run `node test/example_api_server.js`
 */

const OasGraph = require('../index.js')
const graphql = require('graphql').graphql

/**
 * Set up the schema first
 */
let schema
beforeAll(() => {
  let oas = require('./example_oas.json')
  return OasGraph.createGraphQlSchema(oas)
    .then(createdSchema => {
      schema = createdSchema
    })
})

test('Get single resource', () => {
  let query = `{
    user (username: "erik") {
      name
    }
  }`
  return graphql(schema, query).then(result => {
    expect(result).toEqual({data: {user: {name: 'Erik Wittern'}}})
  })
})

test('Get single resource 2', () => {
  let query = `{
    company (id: "ibm") {
      legalForm
    }
  }`
  return graphql(schema, query).then(result => {
    expect(result).toEqual({data: {company: {legalForm: 'public'}}})
  })
})

test('Get nested resource', () => {
  let query = `{
    user (username: "erik") {
      name
      employerCompany {
        legalForm
      }
    }
  }`
  return graphql(schema, query).then(result => {
    expect(result).toEqual({
      data: {
        user: {
          name: 'Erik Wittern',
          employerCompany: {
            legalForm: 'public'
          }
        }
      }
    })
  })
})

test('Get array of strings', () => {
  let query = `{
    user (username: "erik") {
      hobbies
    }
  }`
  return graphql(schema, query).then(result => {
    expect(result).toEqual({
      data: {
        user: {
          hobbies: ['lion dancing', 'doing CEO stuff']
        }
      }
    })
  })
})

test('Get array of objects', () => {
  let query = `{
    company (id: "ibm") {
      offices{
        street
      }
    }
  }`
  return graphql(schema, query).then(result => {
    expect(result).toEqual({
      data: {
        company: {
          offices: [{
            street: '122 Some Street'
          },
          {
            street: '124 Some Street'
          }]
        }
      }
    })
  })
})

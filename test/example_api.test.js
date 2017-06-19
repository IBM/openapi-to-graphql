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
  let oas = require('../fixtures/example_oas.json')
  return OasGraph.createGraphQlSchema(oas)
    .then(createdSchema => {
      schema = createdSchema
    })
})

test('Get resource', () => {
  let query = `{
    user (username: "erik") {
      name
    }
  }`
  return graphql(schema, query).then(result => {
    expect(result).toEqual({data: {user: {name: 'Erik Wittern'}}})
  })
})

test('Get resource 2', () => {
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

test('Get single resource', () => {
  let query = `{
    user(username: "erik"){
      name
      address{
        street
      }
    }
  }`
  return graphql(schema, query).then(result => {
    expect(result).toEqual({
      data: {
        user: {
          name: 'Erik Wittern',
          address: {
            street: '270 East 10th Street'
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
      employerId: "ibm"
      hobbies: "soccer"
    }) {
      name
    }
  }`
  return graphql(schema, query).then(result => {
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
      employerId: "ibm"
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
  return graphql(schema, query).then(result => {
    expect(result).toEqual({
      data: {
        postUser: {
          name: 'Mr. New Guy',
          employerCompany: {
            ceoUser: {
              name: 'Ginni Rometti'
            }
          }
        }
      }
    })
  })
})

test('Operation id is correctly sanitized, schema names and fields are ' +
  'correctly sanitized, path and query parameters are correctly sanitized, ' +
  'received data is correctly sanitized', () => {
  let query = `{
    productWithId (productId: "this-path", productTag:"And a tag") {
      productId
      productTag
    }
  }`
  return graphql(schema, query).then(result => {
    expect(result).toEqual({
      data: {
        productWithId: {
          productId: 'this-path',
          productTag: 'And a tag'
        }
      }
    })
  })
})

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
  return graphql(schema, query).then(result => {
    expect(result).toEqual({
      'data': {
        'postProductWithId': {
          'productName': 'Soccer ball',
          'productId': 'ball123',
          'productTag': 'sports'
        }
      }
    })
  })
})

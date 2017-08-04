'use strict'

/* globals beforeAll, test, expect */

/**
 * Precondition: run `node test/example_api_server.js`
 */

const OasGraph = require('../lib/index.js')
const {
  graphql,
  parse,
  validate
} = require('graphql')

/**
 * Set up the schema first
 */
let schema
let oas = require('./fixtures/example_oas.json')

beforeAll(() => {
  let oas = require('./fixtures/example_oas.json')
  return OasGraph.createGraphQlSchema(oas, {
    addSubOperations: true
  })
    .then(createdSchema => {
      schema = createdSchema
    })
})

test('Get resource (incl. enum)', () => {
  let query = `{
    user (username: "erik") {
      name
      status
    }
  }`
  return graphql(schema, query).then(result => {
    expect(result).toEqual({data: {user: {name: 'Erik Wittern', status: 'staff'}}})
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

test('Get nested resource via link $response.body#/...', () => {
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

test('Get nested resource via link $request.path#/... and $request.query#/', () => {
  let query = `{
    productWithId (productId: "123" productTag: "blah") {
      productName
      reviews (productTag: "sport")
    }
  }`
  return graphql(schema, query).then(result => {
    expect(result).toEqual({
      data: {
        'productWithId': {
          'productName': 'Super Product',
          'reviews': ['Great product', 'I love it']
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

test('Sub operations are properly made available', () => {
  let query = `{
    user (username: "erik") {
      name
      car {
        color
        model
      }
    }
  }`
  return graphql(schema, query, null, {}).then(result => {
    expect(result).toEqual({
      data: {
        user: {
          name: 'Erik Wittern',
          car: {
            color: 'black',
            model: 'BMW 7 series'
          }
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
    Status (globalquery: "test")
  }`
  return OasGraph.createGraphQlSchema(oas, options)
    .then(createdSchema => {
      // validate that 'limit' parameter is covered by options:
      let ast = parse(query)
      let errors = validate(createdSchema, ast)
      expect(errors).toEqual([])
      return graphql(createdSchema, query).then(result => {
        expect(result).toEqual({
          data: {
            Status: 'Ok.'
          }
        })
      })
    })
})

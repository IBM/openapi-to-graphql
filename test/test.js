'use strict'

const test = require('tape')
const OasGraph = require('../index.js')
const graphql = require('graphql').graphql

/**
 * These tests require the Example API to be running.
 */

let oas = require('./example_oas.json')
OasGraph.createGraphQlSchema(oas)
  .then(schema => {
    /**
     * Basic fetching of resources
     */
    test('Get user', t => {
      let query = `{
        user (username: "erik") {
          name
        }
      }`
      graphql(schema, query).then(result => {
        t.ok(result.data.user.name === 'Erik Wittern', 'name correct')
        t.end()
      })
    })

    test('Get company', t => {
      let query = `{
        company (id: "ibm") {
          legalForm
        }
      }`
      graphql(schema, query).then(result => {
        t.ok(result.data.company.legalForm === 'public', 'legalForm correct')
        t.end()
      })
    })

    /**
     * Nested queries
     */
    test('Get user and employer', t => {
      let query = `{
        user (username: "erik") {
          name
          employerCompany {
            legalForm
          }
        }
      }`
      graphql(schema, query).then(result => {
        t.ok(result.data.user.name === 'Erik Wittern', 'name correct')
        t.ok(result.data.user.employerCompany.legalForm === 'public', 'legalForm correct')
        t.end()
      })
    })

    test('Get hobbies', t => {
      let query = `{
        user (username: "erik") {
          hobbies
        }
      }`
      graphql(schema, query).then(result => {
        t.ok(Array.isArray(result.data.user.hobbies), 'hobbies is an array')
        t.ok(result.data.user.hobbies.length > 0, 'hobbies are present')
        t.ok(result.data.user.hobbies.indexOf('lion dancing') !== -1, 'lion dancing is a hobby')
        t.end()
      })
    })

    test('Get office street names', t => {
      let query = `{
        company (id: "ibm") {
          offices{
            street
          }
        }
      }`
      graphql(schema, query).then(result => {
        t.ok(Array.isArray(result.data.company.offices), 'offices is an array')
        t.ok(result.data.company.offices.length > 0, 'offices are present')
        t.ok(result.data.company.offices[0].street === '122 Some Street', '122 Some Street is an IBM office')
        t.end()
      })
    })
  })
  .catch(err => {
    console.log(err)
  })

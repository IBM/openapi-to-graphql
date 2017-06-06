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
  })
  .catch(err => {
    console.log(err)
  })

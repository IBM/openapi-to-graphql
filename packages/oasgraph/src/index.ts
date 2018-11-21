// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: oasgraph
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

/**
 * Defines the functions exposed by OASGraph.
 *
 * Some general notes:
 *
 * - GraphQL interfaces rely on sanitized strings for (Input) Object Type names
 *   and fields. We perform sanitization only when assigning (field-) names, but
 *   keep keys in the OAS otherwise as-is, to ensure that inner-OAS references
 *   work as expected.
 *
 * - GraphQL (Input) Object Types must have a unique name. Thus, sometimes Input
 *   Object Types and Object Types need separate names, despite them having the
 *   same structure. We thus append 'Input' to every Input Object Type's name
 *   as a convention.
 *
 * - To pass data between resolve functions, OASGraph uses a _oasgraph object
 *   returned by every resolver in addition to its original data (OASGraph does
 *   not use the context to do so, which is an anti-pattern according to=
 *   https://github.com/graphql/graphql-js/issues/953).
 *
 * - OasGraph can handle basic authentication and api key-based authentication
 *   through GraphQL. To do this, OASGraph creates two new intermediate Object
 *   Types called QueryViewer and MutationViewer that take as input security
 *   credentials and pass them on using the _oasgraph object to other resolve
 *   functions.
 */

// Type imports:
import { Options, Report } from './types/options'
import { Oas3 } from './types/oas3'
import { Oas2 } from './types/oas2'
import { Args, Field } from './types/graphql'
import { Operation } from './types/operation'
import { PreprocessingData } from './types/preprocessing_data'
import {
  GraphQLSchema,
  GraphQLObjectType
} from 'graphql'

// Imports:
import { getGraphQLType, getArgs } from './schema_builder'
import { getResolver } from './resolver_builder'
import * as GraphQLTools from './graphql_tools'
import { preprocessOas } from './preprocessor'
import * as Oas3Tools from './oas_3_tools'
import { createAndLoadViewer } from './auth_builder'
import debug from 'debug'
import { GraphQLSchemaConfig } from 'graphql/type/schema'

import * as fs from 'fs'

// Type definitions & exports:
type LoadFieldsParams = {
  operation: Operation,
  operationId: string,
  queryFields: Object,
  mutationFields: Object,
  authQueryFields: Object,
  authMutationFields: Object,
  data: PreprocessingData,
  oas: Oas3,
  options: Options
}
type Result = {
  schema: GraphQLSchema,
  report: Report
}

const log = debug('translation')

/**
 * Creates a GraphQL interface from the given OpenAPI Specification (2 or 3).
 */
export async function createGraphQlSchema (
  spec: Oas3 | Oas2,
  options: Options
): Promise<Result> {
  // deal with option defaults:
  // @ts-ignore
  if (typeof options === 'undefined') options = {}

  options.strict = typeof options.strict === 'boolean'
    ? options.strict
    : false
  options.addSubOperations = typeof options.addSubOperations === 'boolean'
    ? options.addSubOperations
    : false
  options.viewer = typeof options.viewer === 'boolean'
    ? options.viewer
    : true
  options.sendOAuthTokenInQuery = typeof options.sendOAuthTokenInQuery === 'boolean'
    ? options.sendOAuthTokenInQuery
    : false
  options.fillEmptyResponses = typeof options.fillEmptyResponses === 'boolean'
    ? options.fillEmptyResponses
    : false

  options.report = {
    warnings: [],
    numOps: 0,
    numOpsQuery: 0,
    numOpsMutation: 0,
    numQueriesCreated: 0,
    numMutationsCreated: 0
  }

  /**
   * Check if the spec is a valid OAS 3.0.x
   * If the spec is OAS 2.0, attempt to translate it into 3.0.x, then try to
   * translate the spec into a GraphQL schema
   */
  let oas = await Oas3Tools.getValidOAS3(spec)
  let { schema, report } = await translateOpenApiToGraphQL(oas, options)
  return {
    schema,
    report
  }
}

/**
 * Creates a GraphQL interface from the given OpenAPI Specification 3.0.x
 */
async function translateOpenApiToGraphQL (
  oas: Oas3,
  {
    strict,
    headers,
    qs,
    viewer,
    tokenJSONpath,
    addSubOperations,
    sendOAuthTokenInQuery,
    report,
    fillEmptyResponses
  }: Options
): Promise<{ schema: GraphQLSchema, report: Report}> {
  let options = {
    headers,
    qs,
    viewer,
    tokenJSONpath,
    strict,
    addSubOperations,
    sendOAuthTokenInQuery,
    report,
    fillEmptyResponses
  }
  log(`Options: ${JSON.stringify(options)}`)

  /**
   * Extract information from the OAS and put it inside a data structure that
   * is easier for OASGraph to use
   */
  let data = preprocessOas(oas, options)

  /**
   * Create GraphQL fields for every operation and structure them based on their
   * characteristics (query vs. mutation, auth vs. non-auth).
   */
  let queryFields = {}
  let mutationFields = {}
  let authQueryFields = {}
  let authMutationFields = {}
  Object.entries(data.operations)
    // Start with endpoints that DO contain links OR that DO contain sub
    // operations, so that built-up GraphQL object types contain these links
    // when they are re-used.
    .sort(([op1Id, op1], [op2Id, op2]) => sortByHasLinksOrSubOps(op1, op2))
    .forEach(([operationId, operation]) => {
      log(`Process operation "${operationId}"...`)
      let field = getFieldForOperation(operation, data, oas)
      if (!operation.isMutation) {
        let fieldName = operation.responseDefinition.otName
        if (operation.inViewer) {
          for (let securityRequirement of operation.securityRequirements) {
            if (typeof authQueryFields[securityRequirement] !== 'object') {
              authQueryFields[securityRequirement] = {}
            }
            // Avoid overwriting fields that return the same data:
            if (fieldName in authQueryFields[securityRequirement]) {
              fieldName = Oas3Tools.beautifyAndStore(operationId, data.saneMap)
            }
            authQueryFields[securityRequirement][fieldName] = field
          }
        } else {
          // Avoid overwriting fields that return the same data:
          if (fieldName in queryFields) {
            fieldName = Oas3Tools.beautifyAndStore(operationId, data.saneMap)
          }
          queryFields[fieldName] = field
        }
      } else {
        // Use operationId to avoid problems differentiating operations with the
        // same path but differnet methods
        let saneFieldName = Oas3Tools.beautifyAndStore(operationId, data.saneMap)
        if (operation.inViewer) {
          for (let securityRequirement of operation.securityRequirements) {
            if (typeof authMutationFields[securityRequirement] !== 'object') {
              authMutationFields[securityRequirement] = {}
            }
            authMutationFields[securityRequirement][saneFieldName] = field
          }
        } else {
          mutationFields[saneFieldName] = field
        }
      }
    })

  /**
   * Count created queries / mutations
   */
  options.report.numQueriesCreated =
    Object.keys(queryFields).length +
    Object.keys(authQueryFields).reduce((sum, key) => {
      return sum + Object.keys(authQueryFields[key]).length
    }, 0)

  options.report.numMutationsCreated =
    Object.keys(mutationFields).length +
    Object.keys(authMutationFields).reduce((sum, key) => {
      return sum + Object.keys(authMutationFields[key]).length
    }, 0)

  /**
   * Organize created queries / mutations into viewer objects.
   */
  if (Object.keys(authQueryFields).length > 0) {
    Object.assign(queryFields, createAndLoadViewer(
      authQueryFields,
      data,
      oas,
      false
    ))
  }

  if (Object.keys(authMutationFields).length > 0) {
    Object.assign(mutationFields, createAndLoadViewer(
      authMutationFields,
      data,
      oas,
      true
    ))
  }

  /**
   * Build up the schema
   */
  const schemaConfig: GraphQLSchemaConfig = {
    query: Object.keys(queryFields).length > 0
      ? new GraphQLObjectType({
        name: 'query',
        description: 'The start of any query',
        fields: queryFields
      })
      : GraphQLTools.getEmptyObjectType('query'),
    mutation: Object.keys(mutationFields).length > 0
      ? new GraphQLObjectType({
        name: 'mutation',
        description: 'The start of any mutation',
        fields: mutationFields
      })
      : null
  }

  // Fill in yet undefined Object Types to avoid GraphQLSchema from breaking.
  // The reason: once creating the schema, the 'fields' thunks will resolve
  // and if a field references an undefined Object Types, GraphQL will throw.
  Object.entries(data.operations).forEach(([opId, operation]) => {
    if (typeof operation.responseDefinition.ot === 'undefined') {

      operation.responseDefinition.ot = GraphQLTools
        .getEmptyObjectType(operation.responseDefinition.otName)
    }
  })

  const schema = new GraphQLSchema(schemaConfig)

  return { schema, report: options.report }
}

/**
 * Helper function for sorting operations based on them having links or sub-
 * operations.
 */
function sortByHasLinksOrSubOps (op1: Operation, op2: Operation): number {
  const hasOp1 = Object.keys(op1.links).length > 0 ||
    (Array.isArray(op1.subOps) && op1.subOps.length > 0)
  const hasOp2 = Object.keys(op2.links).length > 0 ||
    (Array.isArray(op2.subOps) && op2.subOps.length > 0)
  return (hasOp1 === hasOp2) ? 0 : hasOp1 ? -1 : 1 // hasOp1 = true => -1 = first
}

/**
 * Creates the field object for the given operation.
 */
function getFieldForOperation (
  operation: Operation,
  data: PreprocessingData,
  oas: Oas3
): Field {
  // create GraphQL Type for response:
  let type = getGraphQLType({
    name: operation.responseDefinition.preferredName,
    schema: operation.responseDefinition.schema,
    data,
    operation,
    oas
  })

  // create resolve function:
  let payloadSchemaName = operation.payloadDefinition
    ? operation.payloadDefinition.iotName
    : null
  let payloadSchema = operation.payloadDefinition
    ? operation.payloadDefinition.schema
    : null
  let resolve = getResolver({
    operation,
    oas,
    payloadName: payloadSchemaName,
    data
  })

  // create args:
  let args: Args = getArgs({
    parameters: operation.parameters,
    payloadSchemaName: payloadSchemaName,
    payloadSchema,
    operation,
    data,
    oas
  })

  return {
    type,
    resolve,
    args,
    description: operation.description
  }
}

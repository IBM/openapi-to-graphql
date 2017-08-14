/* @flow */

'use strict'

/**
 * Functions to create viewers that allow users to pass credentials to resolve
 * functions used by OASGraph.
 */

// Type imports:
import type { Oas3 } from './types/oas3.js'
import type { GraphQLObjectType as GQObjectType } from 'graphql'
import type { ResolveFunction } from './resolver_builder.js'
import type { Args } from './schema_builder.js'
import type {
  PreprocessingData,
  ProcessedSecurityScheme
} from './types/preprocessing_data.js'

// Type definitions & exports:
type Viewer = {
  type: GQObjectType,
  resolve: ResolveFunction,
  args: Args,
  description: string
}

// Imports:
import {getGraphQLType} from './schema_builder.js'
import * as Oas3Tools from './oas_3_tools.js'
import debug from 'debug'
import {
  GraphQLString,
  GraphQLObjectType,
  GraphQLNonNull
} from 'graphql'

const log = debug('translation')

/**
 * Load the field object in the appropriate root object
 *
 * i.e. inside either rootQueryFields/rootMutationFields or inside
 * rootQueryFields/rootMutationFields for further processing
 */
const createAndLoadViewer = (
    queryFields: Object,
    data: PreprocessingData,
    oas: Oas3,
    isMutation: boolean = false
) : {[string]: Viewer} => {
  let results = {}
  /**
   * Object that contains all previously defined viewer object names.
   * The key is the security scheme type (apiKey or BasicAuth) and the value is
   * a list of the names for the viewers for that security scheme type.
   */
  let usedViewerNames: {[string]: string[]} = {}

  /**
   * Used to collect all fields in the given querFields object, no matter which
   * protocol. Used to populate anyAuthViewer.
   */
  let anyAuthFields = {}

  for (let protocolName in queryFields) {
    Object.assign(anyAuthFields, queryFields[protocolName])

    /**
     * check if the name has already been used (i.e. in the list)
     * if so, create a new name and add it to the list
     */
    let type = data.security[protocolName].def.type

    /**
     * HTTP is not an authentication protocol
     * HTTP covers a number of different authentication type
     * change the typeName to match the exact authentication type (e.g. basic
     * authentication)
     */
    if (type === 'http') {
      let scheme = data.security[protocolName].def.scheme
      switch (scheme) {
        case 'basic':
          type = 'basicAuth'
          break

        default:
          if (data.options.strict) {
            throw new Error(`Unsupported scheme ${String(scheme)} for HTTP ` +
              `authentication`)
          }
          log(`Unsupported scheme ${String(scheme)} for HTTP authentication`)
      }
    }

    // create name for the viewer
    let viewerName

    if (!isMutation) {
      viewerName = Oas3Tools.beautify(`viewer ${type}`)
    } else {
      viewerName = Oas3Tools.beautify(`mutation viewer ${type}`)
    }

    if (!(type in usedViewerNames)) {
      usedViewerNames[type] = []
    }
    if (usedViewerNames[type].indexOf(viewerName) !== -1) {
      viewerName += (usedViewerNames[type].length + 1)
      usedViewerNames[type].push(viewerName)
    }
    usedViewerNames[type].push(viewerName)

    // Add the viewer object type to the specified root query object type
    results[viewerName] = getViewerOT(
      viewerName, protocolName, type, queryFields[protocolName], data)
  }

  // create name for the AnyAuth viewer
  let anyAuthObjectName

  if (!isMutation) {
    anyAuthObjectName = 'viewerAnyAuth'
  } else {
    anyAuthObjectName = 'mutationViewerAnyAuth'
  }

  // Add the AnyAuth object type to the specified root query object type
  results[anyAuthObjectName] = getViewerAnyAuthOT(
    anyAuthObjectName, anyAuthFields, data, oas)

  return results
}

/**
 * Gets the viewer Object, resolve function, and arguments
 */
const getViewerOT = (
  name: string,
  protocolName: string,
  type: string,
  queryFields: Object,
  data: PreprocessingData
) : Viewer => {
  let scheme: ProcessedSecurityScheme = data.security[protocolName]

  // resolve function:
  let resolve = (root, args, ctx) => {
    let security = {}
    if (typeof protocolName === 'string') {
      security[protocolName] = args
    } else {
      security.anyAuth = args
    }

    /**
     * viewers are always root, so we can instantiate _oasgraph here without
     * previously checking for its existence
     */
    return {
      _oasgraph: {
        security
      }
    }
  }

  // arguments:
  let args = {}
  if (typeof scheme === 'object') {
    for (let parameterName in scheme.parameters) {
      args[parameterName] = {type: new GraphQLNonNull(GraphQLString)}
    }
  }

  return {
    type: new GraphQLObjectType({
      name: name,
      description: `A viewer for the security protocol: "${scheme.rawName}"`,
      fields: queryFields
    }),
    resolve,
    args,
    description: `A viewer that wraps all operations authenticated via ${type}`
  }
}

/**
 * Create an object containing an AnyAuth viewer, its resolve function,
 * and its args.
 */
const getViewerAnyAuthOT = (
  name: string,
  queryFields: Object,
  data: PreprocessingData,
  oas: Oas3
) : Viewer => {
  let args = {}
  for (let protocolName in data.security) {
    // create input object types for the viewer arguments
    // NOTE: does not need to check for OAuth 2.0 anymore
    // TODO: This is bad. We don't pass an operation, which is needed for
    // creating the GraphQLType, though.
    let type = getGraphQLType({
      name: protocolName,
      schema: data.security[protocolName].schema,
      data,
      oas,
      isMutation: true
    })
    args[Oas3Tools.beautify(protocolName)] = {type}
  }

  // pass object containing security information to fields
  let resolve = (root, args, ctx) => {
    return {
      _oasgraph: {
        security: args
      }
    }
  }

  return {
    type: new GraphQLObjectType({
      name: name,
      description: 'Warning: Not every request will work with this viewer type',
      fields: queryFields
    }),
    resolve,
    args,
    description: `A viewer that wraps operations for all available ` +
      `authentication mechanisms`
  }
}

module.exports = {
  createAndLoadViewer
}

// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: oasgraph
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

/**
 * Functions to create viewers that allow users to pass credentials to resolve
 * functions used by OASGraph.
 */

// Type imports:
import { Oas3 } from './types/oas3'
import {
  GraphQLObjectType as GQObjectType,
  GraphQLString,
  GraphQLObjectType,
  GraphQLNonNull,
  GraphQLFieldConfigMap} from 'graphql'
import { Args, ResolveFunction } from './types/graphql'
import {
  PreprocessingData,
  ProcessedSecurityScheme
} from './types/preprocessing_data.js'

// Imports:
import { getGraphQLType } from './schema_builder'
import * as Oas3Tools from './oas_3_tools'
import debug from 'debug'
import { handleWarning, sortObject } from './utils'

// Type definitions & exports:
type Viewer = {
  type: GQObjectType,
  resolve: ResolveFunction,
  args: Args,
  description: string
}

const log = debug('translation')

/**
 * Load the field object in the appropriate root object
 *
 * i.e. inside either rootQueryFields/rootMutationFields or inside
 * rootQueryFields/rootMutationFields for further processing
 */
export function createAndLoadViewer (
    queryFields: Object,
    data: PreprocessingData,
    isMutation: boolean = false,
    oass: Oas3[]
): {[key: string]: Viewer} {
  let results = {}
  /**
   * Object that contains all previously defined viewer object names.
   * The key is the security scheme type (apiKey or BasicAuth) and the value is
   * a list of the names for the viewers for that security scheme type.
   */
  let usedViewerNames: {[key: string]: string[]} = {}

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
          handleWarning({
            typeKey: 'UNSUPPORTED_HTTP_AUTH_SCHEME',
            culprit: String(scheme),
            data,
            log
          })
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
    }
    usedViewerNames[type].push(viewerName)

    // Add the viewer object type to the specified root query object type
    results[viewerName] = getViewerOT(
      viewerName, protocolName, type, queryFields[protocolName], data, oass)
  }

  // create name for the AnyAuth viewer
  let anyAuthObjectName

  if (!isMutation) {
    anyAuthObjectName = 'viewerAnyAuth'
  } else {
    anyAuthObjectName = 'mutationViewerAnyAuth'
  }

  // Add the AnyAuth object type to the specified root query object type
  results[anyAuthObjectName] = getViewerAnyAuthOT(anyAuthObjectName, anyAuthFields, data, oass)

  return results
}

/**
 * Gets the viewer Object, resolve function, and arguments
 */
const getViewerOT = (
  name: string,
  protocolName: string,
  type: string,
  queryFields: GraphQLFieldConfigMap<any, any>,
  data: PreprocessingData,
  oass: Oas3[]
): Viewer => {
  let scheme: ProcessedSecurityScheme = data.security[protocolName]

  // resolve function:
  let resolve = (root, args, ctx) => {
    let security: any = {}
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
      args[parameterName] = { type: new GraphQLNonNull(GraphQLString) }
    }
  }
  // Do not sort because they are already "sorted" in preprocessing
  // Otherwise, for basic auth, "password" will appear before "username" 
  
  let typeDescription
  let description
  if (oass.length === 1) {
    typeDescription = `A viewer for the security protocol: '${scheme.rawName}'`
    description = `A viewer that wraps all operations authenticated via ${type}`

  } else {
    typeDescription = `A viewer for the security protocol '${scheme.rawName}' ` +
      `in ${scheme.oas.info.title}`

    description = `A viewer that wraps all operations authenticated via ${type}\n\n` +
      `For the security scheme: ${scheme.oas.info.title} ${protocolName}`
  }

  return {
    type: new GraphQLObjectType({
      name: name,
      description: typeDescription,
      fields: () => queryFields
    }),
    resolve,
    args,
    description
  }
}

/**
 * Create an object containing an AnyAuth viewer, its resolve function,
 * and its args.
 */
const getViewerAnyAuthOT = (
  name: string,
  queryFields: GraphQLFieldConfigMap<any, any>,
  data: PreprocessingData,
  oass: Oas3[]
): Viewer => {
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
      oass,
      isMutation: true
    })
    args[Oas3Tools.beautify(protocolName)] = { type }
  }
  args = sortObject(args)

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
      fields: () => queryFields
    }),
    resolve,
    args,
    description: `A viewer that wraps operations for all available ` +
      `authentication mechanisms`
  }
}

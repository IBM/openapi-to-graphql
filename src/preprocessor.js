'use strict'

const Oas3Tools = require('./oas_3_tools.js')
const deepEqual = require('deep-equal')
const log = require('debug')('preprocessing')

const preprocessOas = (oas) => {
  let result = {
    objectTypeDefs: {},
    objectTypes: {},
    inputObjectTypeDefs: {},
    inputObjectTypes: {},
    operations: {},
    saneMap: {},
    security: {}
  }

  /**
   * Keep track of all schema definitions in the OAS components section. These
   * can be reused later on.
   */
  for (let schemaName in oas.components.schemas) {
    let schemaDef = oas.components.schemas[schemaName]
    result.objectTypeDefs[schemaName] = schemaDef

    // request schema names get "Input" ending to avoid collision with
    // response schema names:
    let reqSchemaName = schemaName + 'Input'
    result.inputObjectTypeDefs[reqSchemaName] = schemaDef
  }

  // Create input object types for the different security protocols for
  // viewerAnyAuth and mutationViewerAnyAuth
  for (let protocolName in oas.components.securitySchemes) {
    let protocol = oas.components.securitySchemes[protocolName]
    let schema
    switch (protocol.type) {
      case ('apiKey'):
        schema = {
          type: 'object',
          description: `API key credentials for the protocol '${protocolName}'`,
          properties: {
            apiKey: {
              type: 'string'
            }
          }
        }
        break

      case ('http'):
        switch (protocol.scheme) {
          case ('basic'):
            schema = {
              type: 'object',
              description: `Basic auth credentials for the protocol '${protocolName}'`,
              properties: {
                username: {
                  type: 'string'
                },
                password: {
                  type: 'string'
                }
              }
            }
            break

          default:
            let error = new Error(`HTTP protocol '${protocol.scheme}' is not currently supported`)
            console.error(error)
            throw error
        }
        break

      case ('oauth2'):
        schema = {
          type: 'object',
          description: `OAuth2 credentials for the protocol '${protocolName}'`,
          properties: {
            test: {
              type: 'string'
            }
          }
        }
        break

      case ('openIdConnect'):
        schema = {
          type: 'object',
          description: `OpenID Connect credentials for the protocol '${protocolName}'`,
          properties: {
            test: {
              type: 'string'
            }
          }
        }
        break

      default:
        let error = new Error('Invalid security protocol')
        console.error(error)
        throw error
    }
    result.inputObjectTypeDefs[Oas3Tools.beautify(protocolName)] = schema
  }

  /**
   * Process all operations
   */
  for (let path in oas.paths) {
    for (let method in oas.paths[path]) {
      /**
       * Only consider Operation Objects
       */
      if (!Oas3Tools.isOperation(method)) {
        continue
      }

      let endpoint = oas.paths[path][method]

      /**
       * Fill in possibly missing operationId.
       */
      if (typeof endpoint.operationId === 'undefined') {
        endpoint.operationId = Oas3Tools.beautify(`${method}:${path}`)
      }

      /**
       * Hold on to operationId:
       */
      let operationId = endpoint.operationId

      /**
       * Request schema
       */
      let reqSchemaName
      let {reqSchema, reqSchemaNames, reqSchemaRequired} = Oas3Tools.getReqSchemaAndNames(
        path, method, oas)

      if (reqSchema && typeof reqSchema === 'object') {
        // determine name of this schema, if we already know it:
        reqSchemaName = getMatchingSchemaName(
          reqSchema, result.inputObjectTypeDefs)

        // if the schema does not yet exist, store it:
        if (!reqSchemaName) {
          let forbiddenNames = Object.keys(result.inputObjectTypeDefs)
          reqSchemaName = getSchemaName(reqSchemaNames, forbiddenNames, operationId)

          // request schema names get "Input" ending to avoid collision with
          // response schema names:
          reqSchemaName = reqSchemaName + 'Input'

          // estimated reqSchemaName may still collide with other schema name:
          while (reqSchemaName in result.inputObjectTypeDefs) {
            reqSchemaName += Math.floor(Math.random() * 10)
          }

          result.inputObjectTypeDefs[reqSchemaName] = reqSchema
        }
      }

      /**
       * Response schema
       */
      let resSchemaName
      let {resSchema, resSchemaNames} = Oas3Tools.getResSchemaAndNames(
        path, method, '200', oas) // TODO: fix - be smarter than 200 here

      if (resSchema && typeof resSchema === 'object') {
        // determine name of this schema, if we already know it:
        resSchemaName = getMatchingSchemaName(
          resSchema, result.objectTypeDefs)

        // if another get operation already produces this schema, we use the
        // operationId here to support both operations
        if (method.toLowerCase() === 'get') {
          for (let opId in result.operations) {
            if (result.operations[opId].resSchemaName === resSchemaName &&
              result.operations[opId].method.toLowerCase() === 'get') {
              resSchemaName = operationId
              result.objectTypeDefs[resSchemaName] = resSchema
            }
          }
        }

        // if the schema does not yet exist, store it:
        if (!resSchemaName) {
          let forbiddenNames = Object.keys(result.objectTypeDefs)
          resSchemaName = getSchemaName(resSchemaNames, forbiddenNames, operationId)

          // estimated reqSchemaName may still collide with other schema name:
          while (resSchemaName in result.objectTypeDefs) {
            resSchemaName += Math.floor(Math.random() * 10)
          }

          result.objectTypeDefs[resSchemaName] = resSchema
        }
      } else {
        log(`Warning: "${method.toUpperCase()} ${path}" has no valid ` +
          `response schema. Ignore operation.`)
        continue
      }

      /**
       * Links
       */
      let links = Oas3Tools.getEndpointLinks(path, method, oas)

      /**
       * Parameters
       */
      let parameters = Oas3Tools.getParameters(path, method, oas)

      /**
       * Security protocols
       */
      let securityProtocols = Oas3Tools.getSecurityProtocols(path, method, oas)

      // store determined information for operation:
      result.operations[operationId] = {
        path,
        method: method.toLowerCase(),
        reqSchemaName,
        reqSchemaRequired,
        resSchemaName,
        links,
        parameters,
        securityProtocols,
        operationId
      }
    }
  }

  /**
   * Security schemas
   */
  result.security = getSecuritySchemes(oas)

  return result
}

/**
 * Extracts all security schemes from given OAS. The resulting data looks like
 * this:
 *
 * {
 *    MyApiKey: {
 *      rawName: "My_api_key",
 *      def: {...},    // definition from oas.components.securitySchemes
 *      parameters: {  // mapping between beautified and distinctive param names
 *        apiKey: MyKey_apiKey
 *      }
 *    }
 *    MyBasicAuth: {
 *      rawName: "My_basic_auth",
 *      def: {...},
 *      parameters: {
 *        username: MyBasicAuth_username,
 *        password: MyBasicAuth_password,
 *      }
 *    }
 *  }
 *
 * @param  {Object} oas OpenAPI Specification 3.0.x
 * @return {Object}     Extracted security definitions (see above)
 */
const getSecuritySchemes = (oas) => {
  let security = {}

  for (let protocolName in oas.components.securitySchemes) {
    let protocol = oas.components.securitySchemes[protocolName]
    // determine parameters for scheme:
    let parameters = {}
    switch (protocol.type) {
      case ('apiKey'):
        parameters = {
          apiKey: Oas3Tools.beautify(`${protocolName}_apiKey`)
        }
        break

      case ('http'):
        switch (protocol.scheme) {
          case ('basic'):
            parameters = {
              username: Oas3Tools.beautify(`${protocolName}_username`),
              password: Oas3Tools.beautify(`${protocolName}_password`)
            }
            break
          default:
            throw new Error(`OASgraph currently does not support the HTTP authentication scheme '${protocol.scheme}'`)
        }
        break

      case ('oauth2'):
        break

      case ('openIdConnect'):
        break

      default:
        throw new Error(`Security definition ${protocolName} does not have a valid type`)
    }

    // add protocol data:
    security[Oas3Tools.beautify(protocolName)] = {
      rawName: protocolName,
      def: protocol,
      parameters
    }
  }
  return security
}

/**
 * Checks if the given schema matches any schema defined in the given object and
 * returns the key of that schema.
 *
 * @param  {object} schema     JSON schema
 * @param  {object} schemaDict Dictionary of JSON schemas
 * @return {string}            Key of matching schema in schemaDict, or null
 */
const getMatchingSchemaName = (schema, schemaDict) => {
  for (let key in schemaDict) {
    if (deepEqual(schemaDict[key], schema)) return key
  }
  return null
}

/**
 * Determines name to use for schema from previously determined schemaNames.
 *
 * @param  {object} schemaNames Contains fromRef, fromSchema, fromPath
 * @param  {array} usedNames    List of names that cannot be chosen
 * @param  {string} operationId The operationId, used as backup name
 * @return {string}             Determined name for the schema
 */
const getSchemaName = (schemaNames, usedNames, operationId) => {
  if (typeof schemaNames.fromRef === 'string' &&
    !usedNames.includes(schemaNames.fromRef)) {
    return schemaNames.fromRef
  } else if (typeof schemaNames.fromSchema === 'string' &&
    !usedNames.includes(schemaNames.fromSchema)) {
    return schemaNames.fromRef
  } else if (typeof schemaNames.fromPath === 'string' &&
    !usedNames.includes(schemaNames.fromPath)) {
    return schemaNames.fromPath
  } else {
    return operationId
  }
}

module.exports = {
  preprocessOas
}

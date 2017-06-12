'use strict'

const Oas3Tools = require('./oas_3_tools.js')
const deepEqual = require('deep-equal')

const preprocessOas = (oas) => {
  let result = {
    objectTypeDefs: {},
    objectTypes: {},
    inputObjectTypeDefs: {},
    inputObjectTypes: {},
    operations: {}
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

  /**
   * Process all operations
   */
  for (let path in oas.paths) {
    for (let method in oas.paths[path]) {
      let endpoint = oas.paths[path][method]

      /**
       * Fill in possibly missing operationId.
       */
      if (typeof endpoint.operationId === 'undefined') {
        endpoint.operationId = Oas3Tools.beautify(`${method}:${path}}`)
      }

      // hold on to operationId:
      let operationId = endpoint.operationId

      /**
       * Request schema
       */
      let reqSchemaName
      let {reqSchema, reqSchemaNames, reqSchemaRequired} = Oas3Tools.getReqSchemaAndNames(
        path, method, oas)

      if (typeof reqSchema === 'object') {
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

      if (typeof resSchema === 'object') {
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

          // sanitize the response schema name:
          resSchemaName = Oas3Tools.beautify(resSchemaName)

          result.objectTypeDefs[resSchemaName] = resSchema
        }
      }

      /**
       * Links
       */
      let links = Oas3Tools.getEndpointLinks(path, method, oas)

      /**
       * Parameters
       */
      let parameters = Oas3Tools.getParameters(path, method, oas)

      // store determined information for operation:
      result.operations[operationId] = {
        path,
        method: method.toLowerCase(),
        reqSchemaName,
        reqSchemaRequired,
        resSchemaName,
        links,
        parameters
      }
    }
  }

  return result
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

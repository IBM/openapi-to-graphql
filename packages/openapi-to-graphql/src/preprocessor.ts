// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

// Type imports:
import { Oas3, SchemaObject, LinkObject } from './types/oas3'
import { InternalOptions } from './types/options'
import { Operation, DataDefinition } from './types/operation'
import {
  PreprocessingData,
  ProcessedSecurityScheme
} from './types/preprocessing_data'

// Imports:
import * as Oas3Tools from './oas_3_tools'
import * as deepEqual from 'deep-equal'
import debug from 'debug'
import { handleWarning, getCommonPropertyNames } from './utils'
import { GraphQLOperationType } from './types/graphql'

const preprocessingLog = debug('preprocessing')

/**
 * Extract information from the OAS and put it inside a data structure that
 * is easier for OpenAPI-to-GraphQL to use
 */
export function preprocessOas(
  oass: Oas3[],
  options: InternalOptions
): PreprocessingData {
  const data: PreprocessingData = {
    usedTypeNames: [
      'Query', // Used by OpenAPI-to-GraphQL for root-level element
      'Mutation' // Used by OpenAPI-to-GraphQL for root-level element
    ],
    defs: [],
    operations: {},
    saneMap: {},
    security: {},
    options,
    oass
  }

  oass.forEach(oas => {
    // Store stats on OAS:
    data.options.report.numOps += Oas3Tools.countOperations(oas)
    data.options.report.numOpsMutation += Oas3Tools.countOperationsMutation(oas)
    data.options.report.numOpsQuery += Oas3Tools.countOperationsQuery(oas)

    // Get security schemes
    const currentSecurity = getProcessedSecuritySchemes(oas, data)
    const commonSecurityPropertyName = getCommonPropertyNames(
      data.security,
      currentSecurity
    )
    commonSecurityPropertyName.forEach(propertyName => {
      handleWarning({
        typeKey: 'DUPLICATE_SECURITY_SCHEME',
        message: `Multiple OASs share security schemes with the same name '${propertyName}'`,
        mitigationAddendum:
          `The security scheme from OAS ` +
          `'${currentSecurity[propertyName].oas.info.title}' will be ignored`,
        data,
        log: preprocessingLog
      })
    })
    // Do not overwrite preexisting security schemes
    data.security = { ...currentSecurity, ...data.security }

    // Process all operations
    for (let path in oas.paths) {
      for (let method in oas.paths[path]) {
        //  Only consider Operation Objects
        if (!Oas3Tools.isOperation(method)) {
          continue
        }

        const endpoint = oas.paths[path][method]
        const operationString =
          oass.length === 1
            ? Oas3Tools.formatOperationString(method, path)
            : Oas3Tools.formatOperationString(method, path, oas.info.title)

        // Determine description
        let description = endpoint.description
        if (
          (typeof description !== 'string' || description === '') &&
          typeof endpoint.summary === 'string'
        ) {
          description = endpoint.summary
        }

        if (data.options.equivalentToMessages && description) {
          description += `\n\nEquivalent to ${operationString}`
        }

        // Hold on to the operationId
        const operationId =
          typeof endpoint.operationId !== 'undefined'
            ? endpoint.operationId
            : Oas3Tools.generateOperationId(method, path)

        // Request schema
        const {
          payloadContentType,
          payloadSchema,
          payloadSchemaNames,
          payloadRequired
        } = Oas3Tools.getRequestSchemaAndNames(path, method, oas)

        const payloadDefinition =
          payloadSchema && typeof payloadSchema !== 'undefined'
            ? createDataDef(
                payloadSchemaNames,
                payloadSchema as SchemaObject,
                true,
                data,
                undefined,
                oas
              )
            : undefined

        // Response schema
        const {
          responseContentType,
          responseSchema,
          responseSchemaNames,
          statusCode
        } = Oas3Tools.getResponseSchemaAndNames(
          path,
          method,
          oas,
          data,
          options
        )

        if (!responseSchema || typeof responseSchema !== 'object') {
          handleWarning({
            typeKey: 'MISSING_RESPONSE_SCHEMA',
            message:
              `Operation ${operationString} has no (valid) response schema. ` +
              `You can use the fillEmptyResponses option to create a ` +
              `placeholder schema`,
            data,
            log: preprocessingLog
          })
          continue
        }

        // Links
        const links = Oas3Tools.getEndpointLinks(path, method, oas, data)

        const responseDefinition = createDataDef(
          responseSchemaNames,
          responseSchema as SchemaObject,
          false,
          data,
          links,
          oas
        )

        // Parameters
        const parameters = Oas3Tools.getParameters(path, method, oas)

        // Security protocols
        const securityRequirements = options.viewer
          ? Oas3Tools.getSecurityRequirements(path, method, data.security, oas)
          : []

        // Servers
        const servers = Oas3Tools.getServers(path, method, oas)

        // Whether to place this operation into an authentication viewer
        const inViewer =
          securityRequirements.length > 0 && data.options.viewer !== false

        /**
         * Whether the operation should be added as a Query or Mutation field.
         * By default, all GET operations are Query fields and all other
         * operations are Mutation fields.
         */
        let isMutation = method.toLowerCase() !== 'get'

        // Option selectQueryOrMutationField can override isMutation
        if (
          typeof options.selectQueryOrMutationField === 'object' &&
          typeof options.selectQueryOrMutationField[oas.info.title] ===
            'object' &&
          typeof options.selectQueryOrMutationField[oas.info.title][path] ===
            'object' &&
          typeof options.selectQueryOrMutationField[oas.info.title][path][
            method
          ] === 'number' // This is an TS enum, which is translated to have a integer value
        ) {
          isMutation =
            options.selectQueryOrMutationField[oas.info.title][path][method] ===
            GraphQLOperationType.Mutation
        }

        // Store determined information for operation
        const operation: Operation = {
          operationId,
          operationString,
          description,
          path,
          method: method.toLowerCase(),
          payloadContentType,
          payloadDefinition,
          payloadRequired,
          responseContentType,
          responseDefinition,
          parameters,
          securityRequirements,
          servers,
          inViewer,
          isMutation,
          statusCode,
          oas
        }

        // Handle operationId property name collision
        // May occur if multiple OAS are provided
        if (operationId in data.operations) {
          handleWarning({
            typeKey: 'DUPLICATE_OPERATIONID',
            message: `Multiple OASs share operations with the same operationId '${operationId}'`,
            mitigationAddendum: `The operation from the OAS '${operation.oas.info.title}' will be ignored`,
            data,
            log: preprocessingLog
          })
        } else {
          data.operations[operationId] = operation
        }
      }
    }
  })

  return data
}

/**
 * Extracts the security schemes from given OAS and organizes the information in
 * a data structure that is easier for OpenAPI-to-GraphQL to use
 *
 * Here is the structure of the data:
 * {
 *   {string} [sanitized name] { Contains information about the security protocol
 *     {string} rawName           Stores the raw security protocol name
 *     {object} def               Definition provided by OAS
 *     {object} parameters        Stores the names of the authentication credentials
 *                                  NOTE: Structure will depend on the type of the protocol
 *                                    (e.g. basic authentication, API key, etc.)
 *                                  NOTE: Mainly used for the AnyAuth viewers
 *     {object} schema            Stores the GraphQL schema to create the viewers
 *   }
 * }
 *
 * Here is an example:
 * {
 *   MyApiKey: {
 *     rawName: "My_api_key",
 *     def: { ... },
 *     parameters: {
 *       apiKey: MyKeyApiKey
 *     },
 *     schema: { ... }
 *   }
 *   MyBasicAuth: {
 *     rawName: "My_basic_auth",
 *     def: { ... },
 *     parameters: {
 *       username: MyBasicAuthUsername,
 *       password: MyBasicAuthPassword,
 *     },
 *     schema: { ... }
 *   }
 * }
 */
function getProcessedSecuritySchemes(
  oas: Oas3,
  data: PreprocessingData
): { [key: string]: ProcessedSecurityScheme } {
  const result = {}
  const security = Oas3Tools.getSecuritySchemes(oas)

  // Loop through all the security protocols
  for (let key in security) {
    const protocol = security[key]

    let schema
    // Determine the parameters and the schema for the security protocol
    let parameters = {}
    let description
    switch (protocol.type) {
      case 'apiKey':
        description = `API key credentials for the security protocol '${key}'`
        if (data.oass.length > 1) {
          description += ` in ${oas.info.title}`
        }

        parameters = {
          apiKey: Oas3Tools.sanitize(
            `${key}_apiKey`,
            Oas3Tools.CaseStyle.camelCase
          )
        }

        schema = {
          type: 'object',
          description,
          properties: {
            apiKey: {
              type: 'string'
            }
          }
        }
        break

      case 'http':
        switch (protocol.scheme) {
          /**
           * TODO: HTTP has a number of authentication types
           *
           * See http://www.iana.org/assignments/http-authschemes/http-authschemes.xhtml
           */
          case 'basic':
            description = `Basic auth credentials for security protocol '${key}'`

            parameters = {
              username: Oas3Tools.sanitize(
                `${key}_username`,
                Oas3Tools.CaseStyle.camelCase
              ),
              password: Oas3Tools.sanitize(
                `${key}_password`,
                Oas3Tools.CaseStyle.camelCase
              )
            }

            schema = {
              type: 'object',
              description,
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
            handleWarning({
              typeKey: 'UNSUPPORTED_HTTP_SECURITY_SCHEME',
              message:
                `Currently unsupported HTTP authentication protocol ` +
                `type 'http' and scheme '${protocol.scheme}' in OAS ` +
                `'${oas.info.title}'`,
              data,
              log: preprocessingLog
            })
        }
        break

      // TODO: Implement
      case 'openIdConnect':
        handleWarning({
          typeKey: 'UNSUPPORTED_HTTP_SECURITY_SCHEME',
          message:
            `Currently unsupported HTTP authentication protocol ` +
            `type 'openIdConnect' in OAS '${oas.info.title}'`,
          data,
          log: preprocessingLog
        })
        break

      case 'oauth2':
        handleWarning({
          typeKey: 'OAUTH_SECURITY_SCHEME',
          message:
            `OAuth security scheme found in OAS '${oas.info.title}'. ` +
            `OAuth support is provided using the 'tokenJSONpath' option`,
          data,
          log: preprocessingLog
        })

        // Continue because we do not want to create an oauth viewer
        continue

      default:
        handleWarning({
          typeKey: 'UNSUPPORTED_HTTP_SECURITY_SCHEME',
          message:
            `Unsupported HTTP authentication protocol` +
            `type '${protocol.type}' in OAS '${oas.info.title}'`,
          data,
          log: preprocessingLog
        })
    }

    // Add protocol data to the output
    result[key] = {
      rawName: key,
      def: protocol,
      parameters,
      schema,
      oas
    }
  }
  return result
}

/**
 * Method to either create a new or reuse an existing, centrally stored data
 * definition. Data definitions are objects that hold a schema (= JSON schema),
 * an otName (= String to use as the name for object types), and an iotName
 * (= String to use as the name for input object types). Eventually, data
 * definitions also hold an ot (= the object type for the schema) and an iot
 * (= the input object type for the schema).
 *
 * Either names or preferredName should exist.
 */
export function createDataDef(
  names: Oas3Tools.SchemaNames,
  schema: SchemaObject,
  isInputObjectType: boolean,
  data: PreprocessingData,
  links?: { [key: string]: LinkObject },
  oas?: Oas3
): DataDefinition {
  // Do a basic validation check
  if (!schema || typeof schema === 'undefined') {
    throw new Error(
      `Cannot create data definition for invalid schema ` +
        `'${JSON.stringify(schema)}'`
    )
  }

  if ('$ref' in schema) {
    schema = Oas3Tools.resolveRef(schema['$ref'], oas)
  }

  const preferredName = getPreferredName(names)

  const saneLinks = {}
  if (typeof links === 'object') {
    Object.keys(links).forEach(linkKey => {
      saneLinks[Oas3Tools.sanitize(linkKey, Oas3Tools.CaseStyle.camelCase)] =
        links[linkKey]
    })
  }

  // Determine the index of possible existing data definition
  const index = getSchemaIndex(preferredName, schema, data.defs)

  if (index !== -1) {
    // Found existing data definition. Fetch it
    const existingDataDef = data.defs[index]

    /**
     * Collapse links if possible, i.e. if the current operation has links,
     * combine them with the prexisting ones
     */
    if (typeof saneLinks !== 'undefined') {
      if (typeof existingDataDef.links !== 'undefined') {
        // Check if there are any overlapping links
        Object.keys(existingDataDef.links).forEach(saneLinkKey => {
          if (
            typeof saneLinks[saneLinkKey] !== 'undefined' &&
            !deepEqual(
              existingDataDef.links[saneLinkKey],
              saneLinks[saneLinkKey]
            )
          ) {
            handleWarning({
              typeKey: 'DUPLICATE_LINK_KEY',
              message:
                `Multiple operations with the same response body share the same sanitized ` +
                `link key '${saneLinkKey}' but have different link definitions ` +
                `'${JSON.stringify(existingDataDef.links[saneLinkKey])}' and ` +
                `'${JSON.stringify(saneLinks[saneLinkKey])}'.`,
              data,
              log: preprocessingLog
            })
          }
        })

        /**
         * Collapse the links
         *
         * Avoid overwriting preexisting links
         */
        existingDataDef.links = { ...saneLinks, ...existingDataDef.links }
      } else {
        // No preexisting links, so simply assign the links
        existingDataDef.links = saneLinks
      }
    }

    return existingDataDef
  } else {
    // Else, define a new name, store the def, and return it
    const name = getSchemaName(names, data.usedTypeNames)

    /**
     * Store and sanitize the name
     *
     * TODO: Fix saneName store to avoid using camelCase and capitalizing it
     * Can just use PascalCase from the beginning
     */
    const saneName = Oas3Tools.sanitize(name, Oas3Tools.CaseStyle.camelCase)
    const otName = Oas3Tools.capitalize(
      Oas3Tools.storeSaneName(saneName, name, data.saneMap)
    )
    const iotName = otName + 'Input'

    // Determine the type of the schema
    const targetGraphQLType = Oas3Tools.getSchemaTargetGraphQLType(
      schema as SchemaObject,
      data
    )

    // Only add type names if a type will be created
    if (targetGraphQLType === 'object' || targetGraphQLType === 'array' || targetGraphQLType === 'enum') {
      // Add the names to the master list
      data.usedTypeNames.push(otName)

      // TODO: selectively add input object type names if they will be created
      data.usedTypeNames.push(iotName)
    }

    const def: DataDefinition = {
      preferredName,

      /**
       * Note that schema may contain $ref or schema composition (e.g. allOf)
       *
       * TODO: the schema is used in getSchemaIndex, which allows us to check
       * whether a dataDef has already been created for that particular
       * schema and name pair. The look up should resolve references but
       * currently, it does not.
       */
      schema,
      required: [],
      targetGraphQLType,
      subDefinitions: undefined,
      links: saneLinks,
      graphQLTypeName: otName,
      graphQLInputObjectTypeName: iotName
    }

    if (targetGraphQLType) {
      // Add the def to the master list
      data.defs.push(def)

      // Break schema down into component parts
      // I.e. if it is an list type, create a reference to the list item type
      // Or if it is an object type, create references to all of the field types
      if (targetGraphQLType === 'array' && typeof schema.items === 'object') {
        let itemsSchema = schema.items
        let itemsName = `${name}ListItem`

        if ('$ref' in itemsSchema) {
          itemsName = schema.items['$ref'].split('/').pop()
        }

        const subDefinition = createDataDef(
          // Is this the correct classification for this name? It does not matter in the long run.
          { fromRef: itemsName },
          itemsSchema as SchemaObject,
          isInputObjectType,
          data,
          undefined,
          oas
        )

        // Add list item reference
        def.subDefinitions = subDefinition
      } else if (targetGraphQLType === 'object') {
        def.subDefinitions = {}

        // Resolve allOf element in schema if applicable
        if ('allOf' in schema) {
          addAllOfToDataDef(
            def,
            schema,
            def.required,
            isInputObjectType,
            data,
            oas
          )
        } else if ('anyOf' in schema) {
          handleWarning({
            typeKey: 'UNSUPPORTED_JSON_SCHEMA_KEYWORD',
            message: `OpenAPI-to-GraphQL currently cannot handle 'anyOf' keyword in '${JSON.stringify(
              schema
            )}'`,
            data,
            log: preprocessingLog
          })
        } else if ('oneOf' in schema) {
          handleWarning({
            typeKey: 'UNSUPPORTED_JSON_SCHEMA_KEYWORD',
            message: `OpenAPI-to-GraphQL currently cannot handle 'oneOf' keyword in '${JSON.stringify(
              schema
            )}'`,
            data,
            log: preprocessingLog
          })
        } else if ('not' in schema) {
          handleWarning({
            typeKey: 'UNSUPPORTED_JSON_SCHEMA_KEYWORD',
            message: `OpenAPI-to-GraphQL currently cannot handle 'not' keyword in '${JSON.stringify(
              schema
            )}'`,
            data,
            log: preprocessingLog
          })
        }

        // Add existing properties (regular object type)
        addObjectPropertiesToDataDef(
          def,
          schema,
          def.required,
          isInputObjectType,
          data,
          oas
        )
      } else if (targetGraphQLType === 'union') {
        def.subDefinitions = []

        schema.oneOf.forEach(subSchema => {
          // Dereference subSchema
          let fromRef: string
          if ('$ref' in subSchema) {
            fromRef = subSchema['$ref'].split('/').pop()
            subSchema = Oas3Tools.resolveRef(subSchema['$ref'], oas)
          }

          // TODO: properties should be handled like interfaces, which also means they need to be passed into the subschemas

          // TODO: ensure that unions are not composed of other unions
          // Member types of GraphQL unions must be object base types
          if (subSchema.type === 'object') {
            const subDefinition = createDataDef(
              {
                fromRef,
                fromSchema: subSchema.title,
                fromPath: `${saneName}Member`
              },
              subSchema as SchemaObject,
              isInputObjectType,
              data,
              undefined,
              oas
            )
            ;(def.subDefinitions as DataDefinition[]).push(subDefinition)
          } else {
            handleWarning({
              typeKey: 'UNION_MEMBER_NON_OBJECT',
              message:
                `Union member type '${JSON.stringify(subSchema)}' in ` +
                `union type '${JSON.stringify(schema)}' is not an object ` +
                `type. Union member types must be object base types.`,
              data,
              log: preprocessingLog
            })
          }
        })
      }

      return def
    } else {
      throw new Error(
        `Cannot identify target GraphQL type of schema '${JSON.stringify(
          schema
        )}'`
      )
    }
  }
}

/**
 * Returns the index of the data definition object in the given list that
 * contains the same schema and preferred name as the given one. Returns -1 if
 * that schema could not be found.
 */
function getSchemaIndex(
  preferredName: string,
  schema: SchemaObject,
  dataDefs: DataDefinition[]
): number {
  /**
   * TODO: instead of iterating through the whole list every time, create a
   * hashing function and store all of the DataDefinitions in a hashmap.
   */
  for (let index = 0; index < dataDefs.length; index++) {
    const def = dataDefs[index]

    /**
     * TODO: deepEquals is not sufficient. We also need to resolve references.
     * However, deepEquals should work for vast majority of cases.
     */
    if (preferredName === def.preferredName && deepEqual(schema, def.schema)) {
      return index
    }
  }

  // The schema could not be found in the master list
  return -1
}

/**
 * Determines the preferred name to use for schema regardless of name collisions.
 *
 * In other words, determines the ideal name for a schema.
 *
 * Similar to getSchemaName() except it does not check if the name has already
 * been taken.
 */
function getPreferredName(names: Oas3Tools.SchemaNames): string {
  let schemaName

  // CASE: preferred name already known
  if (typeof names.preferred === 'string') {
    schemaName = names.preferred

    // CASE: name from reference
  } else if (typeof names.fromRef === 'string') {
    schemaName = names.fromRef

    // CASE: name from schema (i.e., "title" property in schema)
  } else if (typeof names.fromSchema === 'string') {
    schemaName = names.fromSchema

    // CASE: name from path
  } else if (typeof names.fromPath === 'string') {
    schemaName = names.fromPath

    // CASE: placeholder name
  } else {
    schemaName = 'PlaceholderName'
  }

  return Oas3Tools.sanitize(schemaName, Oas3Tools.CaseStyle.camelCase)
}

/**
 * Determines name to use for schema from previously determined schemaNames and
 * considering not reusing existing names.
 */
function getSchemaName(
  names: Oas3Tools.SchemaNames,
  usedNames: string[]
): string {
  if (Object.keys(names).length === 1 && typeof names.preferred === 'string') {
    throw new Error(
      `Cannot create data definition without name(s), excluding the preferred name.`
    )
  }

  let schemaName

  // CASE: name from reference
  if (typeof names.fromRef === 'string') {
    const saneName = Oas3Tools.sanitize(
      names.fromRef,
      Oas3Tools.CaseStyle.PascalCase
    )
    if (!usedNames.includes(saneName)) {
      schemaName = names.fromRef
    }
  }

  // CASE: name from schema (i.e., "title" property in schema)
  if (!schemaName && typeof names.fromSchema === 'string') {
    const saneName = Oas3Tools.sanitize(
      names.fromSchema,
      Oas3Tools.CaseStyle.PascalCase
    )
    if (!usedNames.includes(saneName)) {
      schemaName = names.fromSchema
    }
  }

  // CASE: name from path
  if (!schemaName && typeof names.fromPath === 'string') {
    const saneName = Oas3Tools.sanitize(
      names.fromPath,
      Oas3Tools.CaseStyle.PascalCase
    )
    if (!usedNames.includes(saneName)) {
      schemaName = names.fromPath
    }
  }

  // CASE: all names are already used - create approximate name
  if (!schemaName) {
    schemaName = Oas3Tools.sanitize(
      typeof names.fromRef === 'string'
        ? names.fromRef
        : typeof names.fromSchema === 'string'
        ? names.fromSchema
        : typeof names.fromPath === 'string'
        ? names.fromPath
        : 'PlaceholderName',
      Oas3Tools.CaseStyle.PascalCase
    )
  }

  if (usedNames.includes(schemaName)) {
    let appendix = 2

    /**
     * GraphQL Objects cannot share the name so if the name already exists in
     * the master list append an incremental number until the name does not
     * exist anymore.
     */
    while (usedNames.includes(`${schemaName}${appendix}`)) {
      appendix++
    }
    schemaName = `${schemaName}${appendix}`
  }

  return schemaName
}

/**
 * Recursively add the (nested) allOf schemas to the root-level data definition
 *
 * @param def Root-level data definition
 */
function addAllOfToDataDef(
  def: DataDefinition,
  schema: SchemaObject,
  required: string[],
  isInputObjectType: boolean,
  data: PreprocessingData,
  oas?: Oas3
) {
  schema.allOf.forEach(subSchema => {
    // Dereference subSchema
    if ('$ref' in subSchema) {
      subSchema = Oas3Tools.resolveRef(subSchema['$ref'], oas)
    }

    // Recurse into nested allOf (if applicable)
    if ('allOf' in subSchema) {
      addAllOfToDataDef(def, subSchema, required, isInputObjectType, data, oas)
    }

    // Add properties of the subSchema
    addObjectPropertiesToDataDef(
      def,
      subSchema,
      required,
      isInputObjectType,
      data,
      oas
    )
  })
}

/**
 * Add the properties to the data definition
 */
function addObjectPropertiesToDataDef(
  def: DataDefinition,
  schema: SchemaObject,
  required: string[],
  isInputObjectType: boolean,
  data: PreprocessingData,
  oas?: Oas3
) {
  /**
   * Resolve all required properties
   *
   * TODO: required may contain duplicates, which is not necessarily a problem
   */
  if (Array.isArray(schema.required)) {
    schema.required.forEach(requiredProperty => {
      required.push(requiredProperty)
    })
  }

  for (let propertyKey in schema.properties) {
    let propSchemaName = propertyKey
    let propSchema = schema.properties[propertyKey]

    if ('$ref' in propSchema) {
      propSchemaName = propSchema['$ref'].split('/').pop()
    }

    const subDefinition = createDataDef(
      {
        fromRef: propSchemaName,
        fromSchema: propSchema.title // TODO: Currently not utilized because of fromRef but arguably, propertyKey is a better field name and title is a better type name
      },
      propSchema as SchemaObject,
      isInputObjectType,
      data,
      undefined,
      oas
    )
    // Add field type references
    def.subDefinitions[propertyKey] = subDefinition
  }
}

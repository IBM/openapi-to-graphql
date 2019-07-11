// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

/**
 * Functions to translate JSON schema to GraphQL (input) object types.
 */

// Type imports:
import { PreprocessingData } from './types/preprocessing_data'
import { Operation, DataDefinition } from './types/operation'
import {
  Oas3,
  SchemaObject,
  ParameterObject,
  ReferenceObject,
  LinkObject,
  LinksObject
} from './types/oas3'
import { Args, Field, GraphQLType } from './types/graphql'
import {
  GraphQLScalarType,
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLNonNull,
  GraphQLList,
  GraphQLInputObjectType,
  GraphQLEnumType,
  GraphQLFieldConfigMap,
  GraphQLOutputType
} from 'graphql'

// Imports:
import * as GraphQLJSON from 'graphql-type-json'
import * as Oas3Tools from './oas_3_tools'
import { getResolver } from './resolver_builder'
import { createDataDef } from './preprocessor'
import debug from 'debug'
import { handleWarning, sortObject } from './utils'

// Type definitions & exports:
type GetGraphQLTypeParams = {
  def: DataDefinition
  operation?: Operation
  data: PreprocessingData // Data produced by preprocessing
  iteration?: number // Count of recursions used to create type
  isMutation?: boolean // Whether to create an Input Type
}

type GetArgsParams = {
  def?: DataDefinition
  parameters: ParameterObject[]
  operation?: Operation
  data: PreprocessingData
}

type CreateOrReuseOtParams = {
  def: DataDefinition
  operation?: Operation
  iteration: number
  isMutation: boolean
  data: PreprocessingData
}

type ReuseOrCreateListParams = {
  def: DataDefinition
  operation?: Operation
  iteration: number
  isMutation: boolean
  data: PreprocessingData
}

type ReuseOrCreateEnum = {
  def: DataDefinition
  data: PreprocessingData
}

type ReuseOrCreateScalar = {
  def: DataDefinition
  data: PreprocessingData
}

type CreateFieldsParams = {
  def: DataDefinition
  links: { [key: string]: LinkObject }
  operation?: Operation
  iteration: number
  isMutation: boolean
  data: PreprocessingData
}

type LinkOpRefToOpIdParams = {
  links: { [key: string]: LinkObject }
  linkKey: string
  operation: Operation
  data: PreprocessingData
}

const translationLog = debug('translation')

/**
 * Creates and returns a GraphQL (Input) Type for the given JSON schema.
 */
export function getGraphQLType({
  def,
  operation,
  data,
  iteration = 0,
  isMutation = false
}: GetGraphQLTypeParams): GraphQLType {
  const name = isMutation ? def.iotName : def.otName

  // Avoid excessive iterations
  if (iteration === 50) {
    throw new Error(`Too many iterations when creating schema ${name}`)
  }

  const type = def.type

  // CASE: object - create ObjectType
  if (type === 'object') {
    return createOrReuseOt({
      def,
      operation,
      data,
      iteration,
      isMutation
    })

    // CASE: array - create ArrayType
  } else if (type === 'array') {
    return reuseOrCreateList({
      def,
      operation,
      data,
      iteration,
      isMutation
    })

    // CASE: enum - create EnumType
  } else if (type === 'enum') {
    return reuseOrCreateEnum({
      def,
      data
    })

    // CASE: scalar - return scalar
  } else {
    return getScalarType({
      def,
      data
    })
  }
}

/**
 * Returns an existing (Input) Object Type or creates a new one, and stores it
 * in data
 *
 * A returned GraphQLObjectType has the following internal structure:
 *
 *   new GraphQLObjectType({
 *     name        // Optional name of the type
 *     description // Optional description of type
 *     fields      // REQUIRED returning fields
 *       type      // REQUIRED definition of the field type
 *       args      // Optional definition of types
 *       resolve   // Optional function defining how to obtain this type
 *   })
 */
function createOrReuseOt({
  def,
  operation,
  data,
  iteration,
  isMutation
}: CreateOrReuseOtParams): GraphQLType {
  const schema = def.schema

  // CASE: query - create or reuse OT
  if (!isMutation) {
    if (def.ot && typeof def.ot !== 'undefined') {
      translationLog(
        `Reuse Object Type '${def.otName}'` +
          (typeof operation === 'object'
            ? ` (for operation '${operation.operationId}')`
            : '')
      )
      return def.ot as (
        | GraphQLObjectType
        | GraphQLInputObjectType
        | GraphQLScalarType)
    } else {
      translationLog(
        `Create Object Type '${def.otName}'` +
          (typeof operation === 'object'
            ? ` (for operation '${operation.operationId}')`
            : '')
      )

      /**
       * If the schema does not contain any properties, then OpenAPI-to-GraphQL
       * cannot create a GraphQL Object Type for it because in GraphQL, all Object
       * Type properties must be named.
       *
       * Instead, stringify the response.
       *
       * NOTE: there is a similar check in the resolver_builder.ts so that the
       * response data is properly stringified.
       *
       * See stringifyObjectsWithNoProperties() function
       */
      if (typeof def.schema.properties === 'undefined') {
        handleWarning({
          typeKey: 'OBJECT_MISSING_PROPERTIES',
          message:
            `The operation ` +
            `'${operation.operationString}' contains ` +
            `a object schema ${JSON.stringify(def)} with no properties. ` +
            `GraphQL objects must have well-defined properties so a one to ` +
            `one conversion cannot be achieved.`,
          data,
          log: translationLog
        })
        return GraphQLString
      }

      const description =
        typeof schema.description !== 'undefined'
          ? schema.description
          : 'No description available.'
      def.ot = new GraphQLObjectType({
        name: def.otName,
        description,
        fields: () => {
          return createFields({
            def,
            links: def.links,
            operation,
            data,
            iteration,
            isMutation
          })
        }
      })

      return def.ot
    }
    // CASE: mutation - create or reuse IOT
  } else {
    if (typeof def.iot !== 'undefined') {
      translationLog(
        `Reuse Input Object Type '${def.iotName}'` +
          (typeof operation === 'object'
            ? ` (for operation '${operation.operationId}')`
            : '')
      )
      return def.iot as GraphQLInputObjectType
    } else {
      translationLog(
        `Create Input Object Type '${def.iotName}'` +
          (typeof operation === 'object'
            ? ` (for operation '${operation.operationId}')`
            : '')
      )

      schema.description =
        typeof schema.description !== 'undefined'
          ? schema.description
          : 'No description available.'

      def.iot = new GraphQLInputObjectType({
        name: def.iotName,
        description: schema.description,
        // @ts-ignore
        fields: () => {
          return createFields({
            def,
            links: undefined,
            operation,
            data,
            iteration,
            isMutation
          })
        }
      })

      return def.iot
    }
  }
}

/**
 * Returns an existing List or creates a new one, and stores it in data
 */
function reuseOrCreateList({
  def,
  operation,
  iteration,
  isMutation,
  data
}: ReuseOrCreateListParams): GraphQLList<any> {
  const name = isMutation ? def.iotName : def.otName

  // Try to reuse existing Object Type
  if (!isMutation && def.ot && typeof def.ot !== 'undefined') {
    translationLog(`Reuse GraphQLList '${def.otName}'`)
    return def.ot as GraphQLList<any>
  } else if (isMutation && def.iot && typeof def.iot !== 'undefined') {
    translationLog(`Reuse GraphQLList '${def.iotName}'`)
    return def.iot as GraphQLList<any>
  }

  // Create new List Object Type
  translationLog(`Create GraphQLList '${def.otName}'`)

  // Get definition of the list item, which should be in the sub definitions
  const itemDef = def.subDefinitions as DataDefinition

  // Equivalent to schema.items
  const itemsSchema = itemDef.schema
  // Equivalent to `${name}ListItem`
  const itemsName = itemDef.otName

  const itemsType = getGraphQLType({
    def: itemDef,
    data,
    operation,
    iteration: iteration + 1,
    isMutation
  })

  if (itemsType !== null) {
    const listObjectType = new GraphQLList(itemsType)

    // Store newly created List Object Type
    if (!isMutation) {
      def.ot = listObjectType
    } else {
      def.iot = listObjectType
    }
    return listObjectType
  } else {
    throw new Error(`Cannot create list item object type '${itemsName}' in list 
    '${name}' with schema '${JSON.stringify(itemsSchema)}'`)
  }
}

/**
 * Returns an existing Enum Type or creates a new one, and stores it in data
 */
function reuseOrCreateEnum({ def, data }: ReuseOrCreateEnum): GraphQLEnumType {
  // Rry to reuse existing Enum Type
  if (def.ot && typeof def.ot !== 'undefined') {
    translationLog(`Reuse  GraphQLEnumType '${def.otName}'`)
    return def.ot as GraphQLEnumType
  } else {
    translationLog(`Create GraphQLEnumType '${def.otName}'`)
    const values = {}
    def.schema.enum.forEach(e => {
      values[Oas3Tools.sanitize(e, false)] = {
        value: e
      }
    })

    // Store newly created Enum Object Type
    def.ot = new GraphQLEnumType({
      name: def.otName,
      values
    })
    return def.ot
  }
}

/**
 * Returns the GraphQL scalar type matching the given JSON schema type
 */
function getScalarType({ def, data }: ReuseOrCreateScalar): GraphQLScalarType {
  const type = def.type

  switch (type) {
    case 'string':
      def.ot = GraphQLString
      break
    case 'integer':
      def.ot = GraphQLInt
      break
    case 'number':
      def.ot = GraphQLFloat
      break
    case 'boolean':
      def.ot = GraphQLBoolean
      break
    case 'json':
      def.ot = GraphQLJSON
      break
    default:
      // If the type is not known, try to stringify
      def.ot = GraphQLString
      break
  }

  return def.ot as GraphQLScalarType
}

/**
 * Creates the fields object to be used by an ObjectType
 */
function createFields({
  def,
  links,
  operation,
  data,
  iteration,
  isMutation
}: CreateFieldsParams): GraphQLFieldConfigMap<any, any> {
  let fields: GraphQLFieldConfigMap<any, any> = {}

  const fieldTypeDefinitions = def.subDefinitions as {
    [fieldName: string]: DataDefinition
  }

  // Create fields for properties
  for (let fieldTypeKey in fieldTypeDefinitions) {
    const fieldTypeDefinition = fieldTypeDefinitions[fieldTypeKey]
    const schema = fieldTypeDefinition.schema

    // Get object type describing the property
    const objectType = getGraphQLType({
      def: fieldTypeDefinition,
      operation,
      data,
      iteration: iteration + 1,
      isMutation
    })

    // Determine if this property is required in mutations
    const reqMutationProp =
      isMutation &&
      'required' in schema &&
      schema.required.includes(fieldTypeKey)

    // Finally, add the object type to the fields (using sanitized field name)
    if (objectType) {
      const sanePropName = Oas3Tools.sanitizeAndStore(
        fieldTypeKey,
        data.saneMap
      )
      fields[sanePropName] = {
        type: reqMutationProp
          ? new GraphQLNonNull(objectType)
          : (objectType as GraphQLOutputType),

        description:
          typeof schema.description === 'undefined'
            ? 'No description available.'
            : schema.description
      }
    }
  }

  // Create fields for links
  if (
    iteration === 0 && // Only for operation-level object types
    operation &&
    typeof operation === 'object' && // Operation is provided
    typeof links === 'object' && // Links are present
    !isMutation // Only if we are not talking INPUT object type
  ) {
    for (let saneLinkKey in links) {
      translationLog(`Create link '${saneLinkKey}'...`)

      // Check if key is already in fields
      if (saneLinkKey in fields) {
        handleWarning({
          typeKey: 'LINK_NAME_COLLISION',
          message:
            `Cannot create link '${saneLinkKey}' because parent ` +
            `Object Type already contains a field with the same (sanitized) name.`,
          data,
          log: translationLog
        })
      } else {
        const link = links[saneLinkKey]

        // Get linked operation
        let linkedOpId
        // TODO: href is yet another alternative to operationRef and operationId
        if (typeof link.operationId === 'string') {
          linkedOpId = link.operationId
        } else if (typeof link.operationRef === 'string') {
          linkedOpId = linkOpRefToOpId({
            links,
            linkKey: saneLinkKey,
            operation,
            data
          })
        }

        /**
         * linkedOpId may not be initialized because operationRef may lead to an
         * operation object that does not have an operationId
         */
        if (typeof linkedOpId === 'string' && linkedOpId in data.operations) {
          const linkedOp = data.operations[linkedOpId]

          // Determine parameters provided via link
          let argsFromLink = link.parameters

          // Remove argsFromLinks from operation parameters
          let dynamicParams = linkedOp.parameters
          if (typeof argsFromLink === 'object') {
            dynamicParams = dynamicParams.filter(p => {
              // Here, we know argsFromLink is present:
              argsFromLink = argsFromLink as Object
              return typeof argsFromLink[p.name] === 'undefined'
            })
          }

          // Get resolve function for link
          const linkResolver = getResolver({
            operation: linkedOp,
            argsFromLink: Oas3Tools.sanitizeObjectKeys(argsFromLink) as {
              [key: string]: string
            },
            data,
            baseUrl: data.options.baseUrl
          })

          // Get args for link
          const args = getArgs({
            parameters: dynamicParams,
            operation: linkedOp,
            data
          })

          /**
           * Get response object type
           * Use the reference here
           * OT will be built up some other time
           */
          const resObjectType = linkedOp.responseDefinition.ot

          let description = link.description

          if (typeof description !== 'string') {
            description = 'No description available.'
          }

          if (data.options.equivalentToMessages) {
            description += `\n\nEquivalent to ${linkedOp.operationString}`
          }

          // Finally, add the object type to the fields (using sanitized field name)
          Oas3Tools.sanitizeAndStore(saneLinkKey, data.saneMap)
          // TODO: check if fields already has this field name
          fields[saneLinkKey] = {
            type: resObjectType,
            resolve: linkResolver,
            args,
            description
          }
        } else {
          handleWarning({
            typeKey: 'UNRESOLVABLE_LINK',
            message: `Cannot resolve target of link '${saneLinkKey}`,
            data,
            log: translationLog
          })
        }
      }
    }
  }

  fields = sortObject(fields)
  return fields
}

/**
 * Returns the operationId that an operationRef is associated to
 *
 * NOTE: If the operation does not natively have operationId, this function
 *  will try to produce an operationId the same way preprocessor.js does it.
 *
 *  Any changes to constructing operationIds in preprocessor.js should be
 *  reflected here.
 */
function linkOpRefToOpId({
  links,
  linkKey,
  operation,
  data
}: LinkOpRefToOpIdParams): string {
  const link = links[linkKey]

  if (typeof link.operationRef === 'string') {
    // TODO: external refs

    const operationRef = link.operationRef
    let linkLocation
    let linkRelativePathAndMethod

    /**
     * Example relative path: '#/paths/~12.0~1repositories~1{username}/get'
     * Example absolute path: 'https://na2.gigantic-server.com/#/paths/~12.0~1repositories~1{username}/get'
     * Extract relative path from relative path
     */
    if (operationRef.substring(0, 8) === '#/paths/') {
      linkRelativePathAndMethod = operationRef

      // Extract relative path from absolute path
    } else {
      /**
       * '#' may exist in other places in the path
       * '/#/' is more likely to point to the beginning of the path
       */
      const firstPathIndex = operationRef.indexOf('#/paths/')

      // Found a relative path candidate
      if (firstPathIndex !== -1) {
        // Check to see if there are other relative path candidates
        const lastPathIndex = operationRef.lastIndexOf('#/paths/')
        if (firstPathIndex !== lastPathIndex) {
          handleWarning({
            typeKey: 'AMBIGUOUS_LINK',
            message:
              `The link '${linkKey}' in operation '${operation.operationString}' ` +
              `contains an ambiguous operationRef '${operationRef}',  ` +
              `meaning it has multiple instances of the string '#/paths/'`,
            data,
            log: translationLog
          })

          return
        }

        linkLocation = operationRef.substring(0, firstPathIndex)
        linkRelativePathAndMethod = operationRef.substring(firstPathIndex)

        // Cannot find relative path candidate
      } else {
        handleWarning({
          typeKey: 'UNRESOLVABLE_LINK',
          message:
            `The link '${linkKey}' in operation '${operation.operationString}' ` +
            `does not contain a valid path in operationRef '${operationRef}', ` +
            `meaning it does not contain a string '#/paths/'`,
          data,
          log: translationLog
        })

        return
      }
    }

    // Infer operationId from relative path
    if (typeof linkRelativePathAndMethod === 'string') {
      let linkPath
      let linkMethod

      /**
       * NOTE: I wish we could extract the linkedOpId by matching the
       * linkedOpObject with an operation in data and extracting the operationId
       * there but that does not seem to be possible especiially because you
       * need to know the operationId just to access the operations so what I
       * have to do is reconstruct the operationId the same way preprocessing
       * does it
       */

      /**
       * linkPath should be the path followed by the method
       *
       * Find the slash that divides the path from the method
       */
      const pivotSlashIndex = linkRelativePathAndMethod.lastIndexOf('/')

      // Check if there are any '/' in the linkPath
      if (pivotSlashIndex !== -1) {
        // Get method

        // Check if there is a method at the end of the linkPath
        if (pivotSlashIndex !== linkRelativePathAndMethod.length - 1) {
          // Start at +1 because we do not want the starting '/'
          linkMethod = linkRelativePathAndMethod.substring(pivotSlashIndex + 1)

          // Check if method is a valid method
          if (!Oas3Tools.OAS_OPERATIONS.includes(linkMethod)) {
            handleWarning({
              typeKey: 'UNRESOLVABLE_LINK',
              message:
                `The operationRef '${operationRef}' contains an ` +
                `invalid HTTP method '${linkMethod}'`,
              data,
              log: translationLog
            })

            return
          }
          // There is no method at the end of the path
        } else {
          handleWarning({
            typeKey: 'UNRESOLVABLE_LINK',
            message:
              `The operationRef '${operationRef}' does not contain an` +
              `HTTP method`,
            data,
            log: translationLog
          })

          return
        }

        /**
         * Get path
         *
         * Substring starts at index 8 and ends at pivotSlashIndex to exclude
         * the '/'s at the ends of the path
         *
         * TODO: improve removing '/#/paths'?
         */
        linkPath = linkRelativePathAndMethod.substring(8, pivotSlashIndex)

        /**
         * linkPath is currently a JSON Pointer
         *
         * Revert the escaped '/', represented by '~1', to form intended path
         */
        linkPath = linkPath.replace(/~1/g, '/')

        // Find the right oas
        const oas =
          typeof linkLocation === 'undefined'
            ? operation.oas
            : getOasFromLinkLocation(linkLocation, link, data)

        // If the link was external, make sure that an OAS could be identified
        if (typeof oas !== 'undefined') {
          if (typeof linkMethod === 'string' && typeof linkPath === 'string') {
            let linkedOpId

            if (linkPath in oas.paths && linkMethod in oas.paths[linkPath]) {
              const linkedOpObject = oas.paths[linkPath][linkMethod]

              if ('operationId' in linkedOpObject) {
                linkedOpId = linkedOpObject.operationId
              }
            }

            if (typeof linkedOpId !== 'string') {
              linkedOpId = Oas3Tools.generateOperationId(linkMethod, linkPath)
            }

            if (linkedOpId in data.operations) {
              return linkedOpId
            } else {
              handleWarning({
                typeKey: 'UNRESOLVABLE_LINK',
                message:
                  `The link '${linkKey}' references an operation with ` +
                  `operationId '${linkedOpId}' but no such operation exists. ` +
                  `Note that the operationId may be autogenerated but ` +
                  `regardless, the link could not be matched to an operation.`,
                data,
                log: translationLog
              })

              return
            }

            // Path and method could not be found
          } else {
            handleWarning({
              typeKey: 'UNRESOLVABLE_LINK',
              message:
                `Cannot identify path and/or method, '${linkPath} and ` +
                `'${linkMethod}' respectively, from operationRef ` +
                `'${operationRef}' in link '${linkKey}'`,
              data,
              log: translationLog
            })

            return
          }

          // External link could not be resolved
        } else {
          handleWarning({
            typeKey: 'UNRESOLVABLE_LINK',
            message:
              `The link '${link.operationRef}' references an external OAS ` +
              `but it was not provided`,
            data,
            log: translationLog
          })

          return
        }

        // Cannot split relative path into path and method sections
      } else {
        handleWarning({
          typeKey: 'UNRESOLVABLE_LINK',
          message:
            `Cannot extract path and/or method from operationRef ` +
            `'${operationRef}' in link '${linkKey}'`,
          data,
          log: translationLog
        })

        return
      }

      // Cannot extract relative path from absolute path
    } else {
      handleWarning({
        typeKey: 'UNRESOLVABLE_LINK',
        message:
          `Cannot extract path and/or method from operationRef ` +
          `'${operationRef}' in link '${linkKey}'`,
        data,
        log: translationLog
      })

      return
    }
  }
}

/**
 * Creates an object with the arguments for resolving a GraphQL (Input) Object
 * Type
 */
export function getArgs({
  def,
  parameters,
  operation,
  data
}: GetArgsParams): Args {
  let args = {}

  // Handle params:
  for (let parameter of parameters) {
    // We need at least a name
    if (typeof parameter.name !== 'string') {
      handleWarning({
        typeKey: 'INVALID_OAS',
        message:
          `The operation '${operation.operationString}' contains a ` +
          `parameter '${JSON.stringify(parameter)}' with no 'name' property`,
        data,
        log: translationLog
      })
      continue
    }

    // TODO: update with requestOptions
    // If this parameter is provided via options, ignore
    if (typeof data.options === 'object') {
      if (
        typeof data.options.headers === 'object' &&
        parameter.name in data.options.headers
      ) {
        continue
      }
      if (
        typeof data.options.qs === 'object' &&
        parameter.name in data.options.qs
      ) {
        continue
      }
    }

    /**
     * Determine type of parameter
     *
     * The type of the parameter can either be contained in the "schema" field
     * or the "content" field (but not both)
     */
    let type: GraphQLType
    let schema: SchemaObject | ReferenceObject
    if (typeof parameter.schema === 'object') {
      schema = parameter.schema
    } else if (typeof parameter.content === 'object') {
      if (
        typeof parameter.content['application/json'] === 'object' &&
        typeof parameter.content['application/json'].schema === 'object'
      ) {
        schema = parameter.content['application/json'].schema
      } else {
        handleWarning({
          typeKey: 'NON_APPLICATION_JSON_SCHEMA',
          message:
            `The operation '${operation.operationString}' contains a ` +
            `parameter '${JSON.stringify(parameter)}' that has a 'content' ` +
            `property but no schemas in application/json format. The ` +
            `parameter will not be created`,
          data,
          log: translationLog
        })
        continue
      }
    } else {
      // Invalid OAS according to 3.0.2
      handleWarning({
        typeKey: 'INVALID_OAS',
        message:
          `The operation '${operation.operationString}' contains a ` +
          `parameter '${JSON.stringify(parameter)}' with no 'schema' or ` +
          `'content' property`,
        data,
        log: translationLog
      })
      continue
    }

    if ('$ref' in schema) {
      schema = Oas3Tools.resolveRef(schema['$ref'], operation.oas)
    }

    // TODO: remove
    const paramDef = createDataDef(
      { fromRef: parameter.name },
      schema as SchemaObject,
      true,
      data
    )

    // @ts-ignore
    type = getGraphQLType({
      def: paramDef,
      operation,
      data,
      iteration: 0,
      isMutation: true
    })

    /**
     * Sanitize the argument name
     *
     * NOTE: when matching these parameters back to requests, we need to again
     * use the real parameter name
     */
    const saneName = Oas3Tools.sanitize(parameter.name)

    // Parameters are not required when a default exists:
    let hasDefault = false
    if (typeof parameter.schema === 'object') {
      let schema = parameter.schema
      if (typeof schema.$ref === 'string') {
        schema = Oas3Tools.resolveRef(parameter.schema.$ref, operation.oas)
      }
      if (typeof (schema as SchemaObject).default !== 'undefined') {
        hasDefault = true
      }
    }
    const paramRequired = parameter.required && !hasDefault

    args[saneName] = {
      type: paramRequired ? new GraphQLNonNull(type) : type,
      description: parameter.description // Might be undefined
    }
  }

  // Add limit argument
  if (
    data.options.addLimitArgument &&
    typeof operation.responseDefinition === 'object' &&
    operation.responseDefinition.schema.type === 'array' &&
    // Only add limit argument to lists of object types, not to lists of scalar types
    ((operation.responseDefinition.subDefinitions as DataDefinition).schema
      .type === 'object' ||
      (operation.responseDefinition.subDefinitions as DataDefinition).schema
        .type === 'array')
  ) {
    // Make sure slicing arguments will not overwrite preexisting arguments
    if ('limit' in args) {
      handleWarning({
        typeKey: 'LIMIT_ARGUMENT_NAME_COLLISION',
        message:
          `The 'limit' argument cannot be added ` +
          `because of a preexisting argument in ` +
          `operation ${operation.operationString}`,
        data,
        log: translationLog
      })
    } else {
      args['limit'] = {
        type: GraphQLInt,
        description:
          `Auto-generated argument that limits the size of ` +
          `returned list of objects/list, selecting the first \`n\` ` +
          `elements of the list`
      }
    }
  }

  // Handle request schema (if present):
  if (typeof def === 'object') {
    const reqObjectType = getGraphQLType({
      def,
      data,
      operation,
      isMutation: true
    })

    // Sanitize the argument name
    const saneName = Oas3Tools.sanitize(def.iotName)
    let reqRequired = false
    if (
      operation &&
      typeof operation === 'object' &&
      typeof operation.payloadRequired === 'boolean'
    ) {
      reqRequired = operation.payloadRequired
    }
    args[saneName] = {
      type: reqRequired ? new GraphQLNonNull(reqObjectType) : reqObjectType,
      description:
        typeof def.schema.description === 'undefined'
          ? 'No description available.'
          : def.schema.description
    }
  }

  args = sortObject(args)
  return args
}

/**
 * Used in the context of links, specifically those using an external operationRef
 * If the reference is an absolute reference, determine the type of location
 *
 * For example, name reference, file path, web-hosted OAS link, etc.
 */
function getLinkLocationType(linkLocation: string): string {
  // TODO
  // Currently we only support the title as a link location
  return 'title'
}

/**
 * Used in the context of links, specifically those using an external operationRef
 * Based on the location of the OAS, retrieve said OAS
 */
function getOasFromLinkLocation(
  linkLocation: string,
  link: LinkObject,
  data: PreprocessingData
): Oas3 {
  // May be an external reference
  switch (getLinkLocationType(linkLocation)) {
    case 'title':
      // Get the possible
      const possibleOass = data.oass.filter(oas => {
        return oas.info.title === linkLocation
      })

      // Check if there are an ambiguous OASs
      if (possibleOass.length === 1) {
        // No ambiguity
        return possibleOass[0]
      } else if (possibleOass.length > 1) {
        // Some ambiguity
        handleWarning({
          typeKey: 'AMBIGUOUS_LINK',
          message:
            `The operationRef '${link.operationRef}' references an ` +
            `OAS '${linkLocation}' but multiple OASs share the same title`,
          data,
          log: translationLog
        })
      } else {
        // No OAS had the expected title
        handleWarning({
          typeKey: 'UNRESOLVABLE_LINK',
          message:
            `The operationRef '${link.operationRef}' references an ` +
            `OAS '${linkLocation}' but no such OAS was provided`,
          data,
          log: translationLog
        })
      }
      break

    // // TODO
    // case 'url':
    //   break

    // // TODO
    // case 'file':
    //   break

    // TODO: should title be default?
    // In cases of names like api.io
    default:
      handleWarning({
        typeKey: 'UNRESOLVABLE_LINK',
        message:
          `The link location of the operationRef ` +
          `'${link.operationRef}' is currently not supported\n` +
          `Currently only the title of the OAS is supported`,
        data,
        log: translationLog
      })
  }
}

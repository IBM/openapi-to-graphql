"use strict";
// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT
Object.defineProperty(exports, "__esModule", { value: true });
const graphql_1 = require("graphql");
// Imports:
const GraphQLJSON = require("graphql-type-json");
const Oas3Tools = require("./oas_3_tools");
const resolver_builder_1 = require("./resolver_builder");
const preprocessor_1 = require("./preprocessor");
const debug_1 = require("debug");
const utils_1 = require("./utils");
const translationLog = debug_1.default('translation');
/**
 * Creates and returns a GraphQL (Input) Type for the given JSON schema.
 */
function getGraphQLType({ def, operation, data, iteration = 0, isInputObjectType = false }) {
    const name = isInputObjectType
        ? def.graphQLInputObjectTypeName
        : def.graphQLTypeName;
    // Avoid excessive iterations
    if (iteration === 50) {
        throw new Error(`Too many iterations when creating schema ${name}`);
    }
    const type = def.type;
    // CASE: object - create ObjectType
    if (type === 'object') {
        return createOrReuseOt({
            def,
            operation,
            data,
            iteration,
            isInputObjectType
        });
        // CASE: array - create ArrayType
    }
    else if (type === 'array') {
        return createOrReuseList({
            def,
            operation,
            data,
            iteration,
            isInputObjectType
        });
        // CASE: enum - create EnumType
    }
    else if (type === 'enum') {
        return createOrReuseEnum({
            def,
            data
        });
        // CASE: scalar - return scalar
    }
    else {
        return getScalarType({
            def,
            data
        });
    }
}
exports.getGraphQLType = getGraphQLType;
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
function createOrReuseOt({ def, operation, data, iteration, isInputObjectType }) {
    // Try to reuse a preexisting (input) object type
    // CASE: query - reuse object type
    if (!isInputObjectType) {
        if (def.graphQLType && typeof def.graphQLType !== 'undefined') {
            translationLog(`Reuse object type '${def.graphQLTypeName}'` +
                (typeof operation === 'object'
                    ? ` (for operation '${operation.operationId}')`
                    : ''));
            return def.graphQLType;
        }
        // CASE: mutation - reuse input object type
    }
    else {
        if (def.graphQLInputObjectType &&
            typeof def.graphQLInputObjectType !== 'undefined') {
            translationLog(`Reuse input object type '${def.graphQLInputObjectTypeName}'` +
                (typeof operation === 'object'
                    ? ` (for operation '${operation.operationId}')`
                    : ''));
            return def.graphQLInputObjectType;
        }
    }
    // Cannot reuse preexisting (input) object type, therefore create one
    const schema = def.schema;
    const description = schema.description;
    /**
     * If the schema does not contain any properties, then OpenAPI-to-GraphQL
     * cannot create a GraphQL Object Type for it because in GraphQL, all Object
     * Type properties must be named.
     *
     * Instead, store response in an arbitray JSON type.
     */
    if ((typeof def.schema.properties === 'undefined' ||
        Object.keys(def.schema.properties).length === 0) && // Empty object
        typeof def.schema.allOf === 'undefined' // allOf can provide all the properties
    // TODO: Add oneOf and anyOf
    ) {
        utils_1.handleWarning({
            typeKey: 'OBJECT_MISSING_PROPERTIES',
            message: `The operation ` +
                `'${operation.operationString}' contains ` +
                `an object schema ${JSON.stringify(schema)} with no properties. ` +
                `GraphQL objects must have well-defined properties so a one to ` +
                `one conversion cannot be achieved.`,
            data,
            log: translationLog
        });
        return GraphQLJSON;
    }
    // CASE: query - create object type
    if (!isInputObjectType) {
        translationLog(`Create object type '${def.graphQLTypeName}'` +
            (typeof operation === 'object'
                ? ` (for operation '${operation.operationId}')`
                : ''));
        def.graphQLType = new graphql_1.GraphQLObjectType({
            name: def.graphQLTypeName,
            description,
            fields: () => {
                return createFields({
                    def,
                    links: def.links,
                    operation,
                    data,
                    iteration,
                    isInputObjectType
                });
            }
        });
        return def.graphQLType;
        // CASE: mutation - create input object type
    }
    else {
        translationLog(`Create input object type '${def.graphQLInputObjectTypeName}'` +
            (typeof operation === 'object'
                ? ` (for operation '${operation.operationId}')`
                : ''));
        def.graphQLInputObjectType = new graphql_1.GraphQLInputObjectType({
            name: def.graphQLInputObjectTypeName,
            description,
            /**
             * There
             */
            // @ts-ignore
            fields: () => {
                return createFields({
                    def,
                    links: undefined,
                    operation,
                    data,
                    iteration,
                    isInputObjectType
                });
            }
        });
        return def.graphQLInputObjectType;
    }
}
/**
 * Returns an existing List or creates a new one, and stores it in data
 */
function createOrReuseList({ def, operation, iteration, isInputObjectType, data }) {
    const name = isInputObjectType
        ? def.graphQLInputObjectTypeName
        : def.graphQLTypeName;
    // Try to reuse existing Object Type
    if (!isInputObjectType &&
        def.graphQLType &&
        typeof def.graphQLType !== 'undefined') {
        translationLog(`Reuse GraphQLList '${def.graphQLTypeName}'`);
        return def.graphQLType;
    }
    else if (isInputObjectType &&
        def.graphQLInputObjectType &&
        typeof def.graphQLInputObjectType !== 'undefined') {
        translationLog(`Reuse GraphQLList '${def.graphQLInputObjectTypeName}'`);
        return def.graphQLInputObjectType;
    }
    // Create new List Object Type
    translationLog(`Create GraphQLList '${def.graphQLTypeName}'`);
    // Get definition of the list item, which should be in the sub definitions
    const itemDef = def.subDefinitions;
    // Equivalent to schema.items
    const itemsSchema = itemDef.schema;
    // Equivalent to `{name}ListItem`
    const itemsName = itemDef.graphQLTypeName;
    const itemsType = getGraphQLType({
        def: itemDef,
        data,
        operation,
        iteration: iteration + 1,
        isInputObjectType
    });
    if (itemsType !== null) {
        const listObjectType = new graphql_1.GraphQLList(itemsType);
        // Store newly created List Object Type
        if (!isInputObjectType) {
            def.graphQLType = listObjectType;
        }
        else {
            def.graphQLInputObjectType = listObjectType;
        }
        return listObjectType;
    }
    else {
        throw new Error(`Cannot create list item object type '${itemsName}' in list 
    '${name}' with schema '${JSON.stringify(itemsSchema)}'`);
    }
}
/**
 * Returns an existing enum type or creates a new one, and stores it in data
 */
function createOrReuseEnum({ def, data }) {
    /**
     * Try to reuse existing enum type
     *
     * Enum types do not have an input variant so only check def.ot
     */
    if (def.graphQLType && typeof def.graphQLType !== 'undefined') {
        translationLog(`Reuse GraphQLEnumType '${def.graphQLTypeName}'`);
        return def.graphQLType;
    }
    else {
        translationLog(`Create GraphQLEnumType '${def.graphQLTypeName}'`);
        const values = {};
        def.schema.enum.forEach(e => {
            // Force enum values to string and value should be in ALL_CAPS
            values[Oas3Tools.sanitize(e.toString(), Oas3Tools.CaseStyle.ALL_CAPS)] = {
                value: e
            };
        });
        // Store newly created Enum Object Type
        def.graphQLType = new graphql_1.GraphQLEnumType({
            name: def.graphQLTypeName,
            values
        });
        return def.graphQLType;
    }
}
/**
 * Returns the GraphQL scalar type matching the given JSON schema type
 */
function getScalarType({ def, data }) {
    const type = def.type;
    switch (type) {
        case 'id':
            def.graphQLType = graphql_1.GraphQLID;
            break;
        case 'string':
            def.graphQLType = graphql_1.GraphQLString;
            break;
        case 'integer':
            def.graphQLType = graphql_1.GraphQLInt;
            break;
        case 'number':
            def.graphQLType = graphql_1.GraphQLFloat;
            break;
        case 'boolean':
            def.graphQLType = graphql_1.GraphQLBoolean;
            break;
        case 'json':
            def.graphQLType = GraphQLJSON;
            break;
        default:
            throw new Error(`Cannot process schema type '${def.type}'.`);
    }
    return def.graphQLType;
}
/**
 * Creates the fields object to be used by an (input) object type
 */
function createFields({ def, links, operation, data, iteration, isInputObjectType }) {
    let fields = {};
    const fieldTypeDefinitions = def.subDefinitions;
    // Create fields for properties
    for (let fieldTypeKey in fieldTypeDefinitions) {
        const fieldTypeDefinition = fieldTypeDefinitions[fieldTypeKey];
        const schema = fieldTypeDefinition.schema;
        // Get object type describing the property
        const objectType = getGraphQLType({
            def: fieldTypeDefinition,
            operation,
            data,
            iteration: iteration + 1,
            isInputObjectType
        });
        // Determine if this property is required in mutations
        const reqMutationProp = isInputObjectType &&
            'required' in def.schema && // The full schema, not subschema, will contain the required property
            def.schema.required.includes(fieldTypeKey);
        // Finally, add the object type to the fields (using sanitized field name)
        if (objectType) {
            const saneFieldTypeKey = Oas3Tools.sanitize(fieldTypeKey, Oas3Tools.CaseStyle.camelCase);
            const sanePropName = Oas3Tools.storeSaneName(saneFieldTypeKey, fieldTypeKey, data.saneMap);
            fields[sanePropName] = {
                type: reqMutationProp
                    ? new graphql_1.GraphQLNonNull(objectType)
                    : objectType,
                description: schema.description
            };
        }
    }
    // Create fields for links
    if (iteration === 0 &&
        operation && // Only for operation-level object types
        typeof operation === 'object' && // Operation is provided
        typeof links === 'object' && // Links are present
        !isInputObjectType // Only object type (input object types cannot make use of links)
    ) {
        for (let saneLinkKey in links) {
            translationLog(`Create link '${saneLinkKey}'...`);
            // Check if key is already in fields
            if (saneLinkKey in fields) {
                utils_1.handleWarning({
                    typeKey: 'LINK_NAME_COLLISION',
                    message: `Cannot create link '${saneLinkKey}' because parent ` +
                        `Object Type already contains a field with the same (sanitized) name.`,
                    data,
                    log: translationLog
                });
            }
            else {
                const link = links[saneLinkKey];
                // Get linked operation
                let linkedOpId;
                // TODO: href is yet another alternative to operationRef and operationId
                if (typeof link.operationId === 'string') {
                    linkedOpId = link.operationId;
                }
                else if (typeof link.operationRef === 'string') {
                    linkedOpId = linkOpRefToOpId({
                        links,
                        linkKey: saneLinkKey,
                        operation,
                        data
                    });
                }
                /**
                 * linkedOpId may not be initialized because operationRef may lead to an
                 * operation object that does not have an operationId
                 */
                if (typeof linkedOpId === 'string' && linkedOpId in data.operations) {
                    const linkedOp = data.operations[linkedOpId];
                    // Determine parameters provided via link
                    let argsFromLink = link.parameters;
                    // Remove argsFromLinks from operation parameters
                    let dynamicParams = linkedOp.parameters;
                    if (typeof argsFromLink === 'object') {
                        dynamicParams = dynamicParams.filter(p => {
                            // Here, we know argsFromLink is present:
                            argsFromLink = argsFromLink;
                            return typeof argsFromLink[p.name] === 'undefined';
                        });
                    }
                    // Get resolve function for link
                    const linkResolver = resolver_builder_1.getResolver({
                        operation: linkedOp,
                        argsFromLink: Oas3Tools.sanitizeObjectKeys(argsFromLink),
                        data,
                        baseUrl: data.options.baseUrl
                    });
                    // Get args for link
                    const args = getArgs({
                        parameters: dynamicParams,
                        operation: linkedOp,
                        data
                    });
                    /**
                     * Get response object type
                     * Use the reference here
                     * OT will be built up some other time
                     */
                    const resObjectType = linkedOp.responseDefinition.graphQLType;
                    let description = link.description;
                    if (data.options.equivalentToMessages && description) {
                        description += `\n\nEquivalent to ${linkedOp.operationString}`;
                    }
                    // Finally, add the object type to the fields (using sanitized field name)
                    // TODO: check if fields already has this field name
                    fields[saneLinkKey] = {
                        type: resObjectType,
                        resolve: linkResolver,
                        args,
                        description
                    };
                }
                else {
                    utils_1.handleWarning({
                        typeKey: 'UNRESOLVABLE_LINK',
                        message: `Cannot resolve target of link '${saneLinkKey}`,
                        data,
                        log: translationLog
                    });
                }
            }
        }
    }
    fields = utils_1.sortObject(fields);
    return fields;
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
function linkOpRefToOpId({ links, linkKey, operation, data }) {
    const link = links[linkKey];
    if (typeof link.operationRef === 'string') {
        // TODO: external refs
        const operationRef = link.operationRef;
        let linkLocation;
        let linkRelativePathAndMethod;
        /**
         * Example relative path: '#/paths/~12.0~1repositories~1{username}/get'
         * Example absolute path: 'https://na2.gigantic-server.com/#/paths/~12.0~1repositories~1{username}/get'
         * Extract relative path from relative path
         */
        if (operationRef.substring(0, 8) === '#/paths/') {
            linkRelativePathAndMethod = operationRef;
            // Extract relative path from absolute path
        }
        else {
            /**
             * '#' may exist in other places in the path
             * '/#/' is more likely to point to the beginning of the path
             */
            const firstPathIndex = operationRef.indexOf('#/paths/');
            // Found a relative path candidate
            if (firstPathIndex !== -1) {
                // Check to see if there are other relative path candidates
                const lastPathIndex = operationRef.lastIndexOf('#/paths/');
                if (firstPathIndex !== lastPathIndex) {
                    utils_1.handleWarning({
                        typeKey: 'AMBIGUOUS_LINK',
                        message: `The link '${linkKey}' in operation '${operation.operationString}' ` +
                            `contains an ambiguous operationRef '${operationRef}', ` +
                            `meaning it has multiple instances of the string '#/paths/'`,
                        data,
                        log: translationLog
                    });
                    return;
                }
                linkLocation = operationRef.substring(0, firstPathIndex);
                linkRelativePathAndMethod = operationRef.substring(firstPathIndex);
                // Cannot find relative path candidate
            }
            else {
                utils_1.handleWarning({
                    typeKey: 'UNRESOLVABLE_LINK',
                    message: `The link '${linkKey}' in operation '${operation.operationString}' ` +
                        `does not contain a valid path in operationRef '${operationRef}', ` +
                        `meaning it does not contain a string '#/paths/'`,
                    data,
                    log: translationLog
                });
                return;
            }
        }
        // Infer operationId from relative path
        if (typeof linkRelativePathAndMethod === 'string') {
            let linkPath;
            let linkMethod;
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
            const pivotSlashIndex = linkRelativePathAndMethod.lastIndexOf('/');
            // Check if there are any '/' in the linkPath
            if (pivotSlashIndex !== -1) {
                // Get method
                // Check if there is a method at the end of the linkPath
                if (pivotSlashIndex !== linkRelativePathAndMethod.length - 1) {
                    // Start at +1 because we do not want the starting '/'
                    linkMethod = linkRelativePathAndMethod.substring(pivotSlashIndex + 1);
                    // Check if method is a valid method
                    if (!Oas3Tools.OAS_OPERATIONS.includes(linkMethod)) {
                        utils_1.handleWarning({
                            typeKey: 'UNRESOLVABLE_LINK',
                            message: `The operationRef '${operationRef}' contains an ` +
                                `invalid HTTP method '${linkMethod}'`,
                            data,
                            log: translationLog
                        });
                        return;
                    }
                    // There is no method at the end of the path
                }
                else {
                    utils_1.handleWarning({
                        typeKey: 'UNRESOLVABLE_LINK',
                        message: `The operationRef '${operationRef}' does not contain an` +
                            `HTTP method`,
                        data,
                        log: translationLog
                    });
                    return;
                }
                /**
                 * Get path
                 *
                 * Substring starts at index 8 and ends at pivotSlashIndex to exclude
                 * the '/'s at the ends of the path
                 *
                 * TODO: improve removing '/#/paths'?
                 */
                linkPath = linkRelativePathAndMethod.substring(8, pivotSlashIndex);
                /**
                 * linkPath is currently a JSON Pointer
                 *
                 * Revert the escaped '/', represented by '~1', to form intended path
                 */
                linkPath = linkPath.replace(/~1/g, '/');
                // Find the right oas
                const oas = typeof linkLocation === 'undefined'
                    ? operation.oas
                    : getOasFromLinkLocation(linkLocation, link, data);
                // If the link was external, make sure that an OAS could be identified
                if (typeof oas !== 'undefined') {
                    if (typeof linkMethod === 'string' && typeof linkPath === 'string') {
                        let linkedOpId;
                        if (linkPath in oas.paths && linkMethod in oas.paths[linkPath]) {
                            const linkedOpObject = oas.paths[linkPath][linkMethod];
                            if ('operationId' in linkedOpObject) {
                                linkedOpId = linkedOpObject.operationId;
                            }
                        }
                        if (typeof linkedOpId !== 'string') {
                            linkedOpId = Oas3Tools.generateOperationId(linkMethod, linkPath);
                        }
                        if (linkedOpId in data.operations) {
                            return linkedOpId;
                        }
                        else {
                            utils_1.handleWarning({
                                typeKey: 'UNRESOLVABLE_LINK',
                                message: `The link '${linkKey}' references an operation with ` +
                                    `operationId '${linkedOpId}' but no such operation exists. ` +
                                    `Note that the operationId may be autogenerated but ` +
                                    `regardless, the link could not be matched to an operation.`,
                                data,
                                log: translationLog
                            });
                            return;
                        }
                        // Path and method could not be found
                    }
                    else {
                        utils_1.handleWarning({
                            typeKey: 'UNRESOLVABLE_LINK',
                            message: `Cannot identify path and/or method, '${linkPath} and ` +
                                `'${linkMethod}' respectively, from operationRef ` +
                                `'${operationRef}' in link '${linkKey}'`,
                            data,
                            log: translationLog
                        });
                        return;
                    }
                    // External link could not be resolved
                }
                else {
                    utils_1.handleWarning({
                        typeKey: 'UNRESOLVABLE_LINK',
                        message: `The link '${link.operationRef}' references an external OAS ` +
                            `but it was not provided`,
                        data,
                        log: translationLog
                    });
                    return;
                }
                // Cannot split relative path into path and method sections
            }
            else {
                utils_1.handleWarning({
                    typeKey: 'UNRESOLVABLE_LINK',
                    message: `Cannot extract path and/or method from operationRef ` +
                        `'${operationRef}' in link '${linkKey}'`,
                    data,
                    log: translationLog
                });
                return;
            }
            // Cannot extract relative path from absolute path
        }
        else {
            utils_1.handleWarning({
                typeKey: 'UNRESOLVABLE_LINK',
                message: `Cannot extract path and/or method from operationRef ` +
                    `'${operationRef}' in link '${linkKey}'`,
                data,
                log: translationLog
            });
            return;
        }
    }
}
/**
 * Creates the arguments for resolving a field
 */
function getArgs({ requestPayloadDef, parameters, operation, data }) {
    let args = {};
    // Handle params:
    for (let parameter of parameters) {
        // We need at least a name
        if (typeof parameter.name !== 'string') {
            utils_1.handleWarning({
                typeKey: 'INVALID_OAS',
                message: `The operation '${operation.operationString}' contains a ` +
                    `parameter '${JSON.stringify(parameter)}' with no 'name' property`,
                data,
                log: translationLog
            });
            continue;
        }
        // If this parameter is provided via options, ignore
        if (typeof data.options === 'object') {
            switch (parameter.in) {
                case 'header':
                    // Check header option
                    if (typeof data.options.headers === 'object' &&
                        parameter.name in data.options.headers) {
                        continue;
                    }
                    // Check requestOptions option
                    if (typeof data.options.requestOptions === 'object' &&
                        typeof data.options.requestOptions.headers === 'object' &&
                        parameter.name in data.options.requestOptions.headers) {
                        continue;
                    }
                    break;
                case 'query':
                    // Check header option
                    if (typeof data.options.qs === 'object' &&
                        parameter.name in data.options.qs) {
                        continue;
                    }
                    // Check requestOptions option
                    if (typeof data.options.requestOptions === 'object' &&
                        typeof data.options.requestOptions.qs === 'object' &&
                        parameter.name in data.options.requestOptions.qs) {
                        continue;
                    }
                    break;
            }
        }
        /**
         * Determine type of parameter
         *
         * The type of the parameter can either be contained in the "schema" field
         * or the "content" field (but not both)
         */
        let type;
        let schema;
        if (typeof parameter.schema === 'object') {
            schema = parameter.schema;
        }
        else if (typeof parameter.content === 'object') {
            if (typeof parameter.content['application/json'] === 'object' &&
                typeof parameter.content['application/json'].schema === 'object') {
                schema = parameter.content['application/json'].schema;
            }
            else {
                utils_1.handleWarning({
                    typeKey: 'NON_APPLICATION_JSON_SCHEMA',
                    message: `The operation '${operation.operationString}' contains a ` +
                        `parameter '${JSON.stringify(parameter)}' that has a 'content' ` +
                        `property but no schemas in application/json format. The ` +
                        `parameter will not be created`,
                    data,
                    log: translationLog
                });
                continue;
            }
        }
        else {
            // Invalid OAS according to 3.0.2
            utils_1.handleWarning({
                typeKey: 'INVALID_OAS',
                message: `The operation '${operation.operationString}' contains a ` +
                    `parameter '${JSON.stringify(parameter)}' with no 'schema' or ` +
                    `'content' property`,
                data,
                log: translationLog
            });
            continue;
        }
        if ('$ref' in schema) {
            schema = Oas3Tools.resolveRef(schema['$ref'], operation.oas);
        }
        // TODO: remove
        const paramDef = preprocessor_1.createDataDef({ fromRef: parameter.name }, schema, true, data);
        // @ts-ignore
        type = getGraphQLType({
            def: paramDef,
            operation,
            data,
            iteration: 0,
            isInputObjectType: true
        });
        /**
         * Sanitize the argument name
         *
         * NOTE: when matching these parameters back to requests, we need to again
         * use the real parameter name
         */
        const saneName = Oas3Tools.sanitize(parameter.name, Oas3Tools.CaseStyle.camelCase);
        // Parameters are not required when a default exists:
        let hasDefault = false;
        if (typeof parameter.schema === 'object') {
            let schema = parameter.schema;
            if (typeof schema.$ref === 'string') {
                schema = Oas3Tools.resolveRef(parameter.schema.$ref, operation.oas);
            }
            if (typeof schema.default !== 'undefined') {
                hasDefault = true;
            }
        }
        const paramRequired = parameter.required && !hasDefault;
        args[saneName] = {
            type: paramRequired ? new graphql_1.GraphQLNonNull(type) : type,
            description: parameter.description // Might be undefined
        };
    }
    // Add limit argument
    if (data.options.addLimitArgument &&
        typeof operation.responseDefinition === 'object' &&
        operation.responseDefinition.schema.type === 'array' &&
        // Only add limit argument to lists of object types, not to lists of scalar types
        (operation.responseDefinition.subDefinitions.schema
            .type === 'object' ||
            operation.responseDefinition.subDefinitions.schema
                .type === 'array')) {
        // Make sure slicing arguments will not overwrite preexisting arguments
        if ('limit' in args) {
            utils_1.handleWarning({
                typeKey: 'LIMIT_ARGUMENT_NAME_COLLISION',
                message: `The 'limit' argument cannot be added ` +
                    `because of a preexisting argument in ` +
                    `operation ${operation.operationString}`,
                data,
                log: translationLog
            });
        }
        else {
            args['limit'] = {
                type: graphql_1.GraphQLInt,
                description: `Auto-generated argument that limits the size of ` +
                    `returned list of objects/list, selecting the first \`n\` ` +
                    `elements of the list`
            };
        }
    }
    // Handle request payload (if present):
    if (typeof requestPayloadDef === 'object') {
        const reqObjectType = getGraphQLType({
            def: requestPayloadDef,
            data,
            operation,
            isInputObjectType: true // Request payloads will always be an input object type
        });
        // Sanitize the argument name
        const saneName = data.options.genericPayloadArgName
            ? 'requestBody'
            : Oas3Tools.sanitize(requestPayloadDef.graphQLInputObjectTypeName, Oas3Tools.CaseStyle.camelCase);
        let reqRequired = false;
        if (typeof operation === 'object' &&
            typeof operation.payloadRequired === 'boolean') {
            reqRequired = operation.payloadRequired;
        }
        args[saneName] = {
            type: reqRequired ? new graphql_1.GraphQLNonNull(reqObjectType) : reqObjectType,
            // TODO: addendum to the description explaining this is the request body
            description: requestPayloadDef.schema.description
        };
    }
    args = utils_1.sortObject(args);
    return args;
}
exports.getArgs = getArgs;
/**
 * Used in the context of links, specifically those using an external operationRef
 * If the reference is an absolute reference, determine the type of location
 *
 * For example, name reference, file path, web-hosted OAS link, etc.
 */
function getLinkLocationType(linkLocation) {
    // TODO: currently we only support the title as a link location
    return 'title';
}
/**
 * Used in the context of links, specifically those using an external operationRef
 * Based on the location of the OAS, retrieve said OAS
 */
function getOasFromLinkLocation(linkLocation, link, data) {
    // May be an external reference
    switch (getLinkLocationType(linkLocation)) {
        case 'title':
            // Get the possible
            const possibleOass = data.oass.filter(oas => {
                return oas.info.title === linkLocation;
            });
            // Check if there are an ambiguous OASs
            if (possibleOass.length === 1) {
                // No ambiguity
                return possibleOass[0];
            }
            else if (possibleOass.length > 1) {
                // Some ambiguity
                utils_1.handleWarning({
                    typeKey: 'AMBIGUOUS_LINK',
                    message: `The operationRef '${link.operationRef}' references an ` +
                        `OAS '${linkLocation}' but multiple OASs share the same title`,
                    data,
                    log: translationLog
                });
            }
            else {
                // No OAS had the expected title
                utils_1.handleWarning({
                    typeKey: 'UNRESOLVABLE_LINK',
                    message: `The operationRef '${link.operationRef}' references an ` +
                        `OAS '${linkLocation}' but no such OAS was provided`,
                    data,
                    log: translationLog
                });
            }
            break;
        // // TODO
        // case 'url':
        //   break
        // // TODO
        // case 'file':
        //   break
        // TODO: should title be default?
        // In cases of names like api.io
        default:
            utils_1.handleWarning({
                typeKey: 'UNRESOLVABLE_LINK',
                message: `The link location of the operationRef ` +
                    `'${link.operationRef}' is currently not supported\n` +
                    `Currently only the title of the OAS is supported`,
                data,
                log: translationLog
            });
    }
}
//# sourceMappingURL=schema_builder.js.map
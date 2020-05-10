"use strict";
// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT
Object.defineProperty(exports, "__esModule", { value: true });
const graphql_scalar_1 = require("graphql-scalar");
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
 * Creates and returns a GraphQL type for the given JSON schema.
 */
function getGraphQLType({ def, schema, operation, data, iteration = 0, isInputObjectType = false }) {
    const name = isInputObjectType
        ? def.graphQLInputObjectTypeName
        : def.graphQLTypeName;
    // Avoid excessive iterations
    if (iteration === 50) {
        throw new Error(`GraphQL type ${name} has excessive nesting of other types`);
    }
    switch (def.targetGraphQLType) {
        // CASE: object - create object type
        case 'object':
            return createOrReuseOt({
                def,
                operation,
                data,
                iteration,
                isInputObjectType
            });
        // CASE: union - create union type
        case 'union':
            return createOrReuseUnion({
                def,
                operation,
                data,
                iteration
            });
        // CASE: list - create list type
        case 'list':
            return createOrReuseList({
                def,
                operation,
                schema,
                data,
                iteration,
                isInputObjectType
            });
        // CASE: enum - create enum type
        case 'enum':
            return createOrReuseEnum({
                def,
                data
            });
        // CASE: scalar - return scalar type
        default:
            return getScalarType({
                def,
                schema,
                isInputObjectType,
                data
            });
    }
}
exports.getGraphQLType = getGraphQLType;
/**
 * Creates an (input) object type or return an existing one, and stores it
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
                    ? ` (for operation '${operation.operationString}')`
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
                    ? ` (for operation '${operation.operationString}')`
                    : ''));
            return def.graphQLInputObjectType;
        }
    }
    // Cannot reuse preexisting (input) object type, therefore create one
    const schema = def.schema;
    const description = schema.description;
    // CASE: query - create object type
    if (!isInputObjectType) {
        translationLog(`Create object type '${def.graphQLTypeName}'` +
            (typeof operation === 'object'
                ? ` (for operation '${operation.operationString}')`
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
                    isInputObjectType: false
                });
            }
        });
        return def.graphQLType;
        // CASE: mutation - create input object type
    }
    else {
        translationLog(`Create input object type '${def.graphQLInputObjectTypeName}'` +
            (typeof operation === 'object'
                ? ` (for operation '${operation.operationString}')`
                : ''));
        def.graphQLInputObjectType = new graphql_1.GraphQLInputObjectType({
            name: def.graphQLInputObjectTypeName,
            description,
            // @ts-ignore
            fields: () => {
                return createFields({
                    def,
                    links: {},
                    operation,
                    data,
                    iteration,
                    isInputObjectType: true
                });
            }
        });
        return def.graphQLInputObjectType;
    }
}
/**
 * Creates a union type or return an existing one, and stores it in data
 */
function createOrReuseUnion({ def, operation, data, iteration }) {
    // Try to reuse existing union type
    if (typeof def.graphQLType !== 'undefined') {
        translationLog(`Reuse union type '${def.graphQLTypeName}'` +
            (typeof operation === 'object'
                ? ` (for operation '${operation.operationString}')`
                : ''));
        return def.graphQLType;
    }
    else {
        translationLog(`Create union type '${def.graphQLTypeName}'` +
            (typeof operation === 'object'
                ? ` (for operation '${operation.operationString}')`
                : ''));
        const schema = def.schema;
        const description = typeof schema.description !== 'undefined'
            ? schema.description
            : 'No description available.';
        const memberTypeDefinitions = def.subDefinitions;
        const types = Object.values(memberTypeDefinitions).map(memberTypeDefinition => {
            return getGraphQLType({
                def: memberTypeDefinition,
                operation,
                data,
                iteration: iteration + 1,
                isInputObjectType: false
            });
        });
        /**
         * Check for ambiguous member types
         *
         * i.e. member types that can be confused with each other.
         */
        checkAmbiguousMemberTypes(def, types, data);
        def.graphQLType = new graphql_1.GraphQLUnionType({
            name: def.graphQLTypeName,
            description,
            types,
            resolveType: (source, context, info) => {
                const properties = Object.keys(source);
                // Remove custom _openAPIToGraphQL property used to pass data
                const otgIndex = properties.indexOf('_openAPIToGraphQL');
                if (otgIndex !== -1) {
                    properties.splice(otgIndex, 1);
                }
                /**
                 * Find appropriate member type
                 *
                 * TODO: currently, the check is performed by only checking the property
                 * names. In the future, we should also check the types of those
                 * properties.
                 *
                 * TODO: there is a chance a that an intended member type cannot be
                 * identified if, for whatever reason, the return data is a superset
                 * of the fields specified in the OAS
                 */
                return types.find(type => {
                    const typeFields = Object.keys(type.getFields());
                    if (properties.length <= typeFields.length) {
                        for (let i = 0; i < properties.length; i++) {
                            if (!typeFields.includes(properties[i])) {
                                return false;
                            }
                        }
                        return true;
                    }
                    return false;
                });
            }
        });
        return def.graphQLType;
    }
}
/**
 * Check for ambiguous member types
 *
 * i.e. member types that can be confused with each other.
 */
function checkAmbiguousMemberTypes(def, types, data) {
    types.sort((a, b) => {
        const aFieldLength = Object.keys(a.getFields()).length;
        const bFieldLength = Object.keys(b.getFields()).length;
        if (aFieldLength < bFieldLength) {
            return -1;
        }
        else if (aFieldLength < bFieldLength) {
            return 1;
        }
        else {
            return 0;
        }
    });
    for (let i = 0; i < types.length - 1; i++) {
        const currentType = types[i];
        for (let j = i + 1; j < types.length; j++) {
            const otherType = types[j];
            // TODO: Check the value, not just the field name
            if (Object.keys(currentType.getFields()).every(field => {
                return Object.keys(otherType.getFields()).includes(field);
            })) {
                utils_1.handleWarning({
                    typeKey: 'AMBIGUOUS_UNION_MEMBERS',
                    message: `Union created from schema '${JSON.stringify(def)}' contains ` +
                        `member types such as '${currentType}' and '${otherType}' ` +
                        `which are ambiguous. Ambiguous member types can cause ` +
                        `problems when trying to resolve types.`,
                    data,
                    log: translationLog
                });
                return;
            }
        }
    }
}
/**
 * Creates a list type or returns an existing one, and stores it in data
 */
function createOrReuseList({ def, operation, schema, iteration, isInputObjectType, data }) {
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
        schema,
        operation,
        iteration: iteration + 1,
        isInputObjectType
    });
    if (itemsType !== null) {
        const listObjectType = new graphql_1.GraphQLList(itemsType);
        // Store newly created list type
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
 * Creates an enum type or returns an existing one, and stores it in data
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
function getScalarType({ def, schema, isInputObjectType, data }) {
    const options = {
        name: ''
    };
    if (isInputObjectType && schema) {
        const type = schema.type;
        const title = schema.title || '';
        options.name =
            title.split(' ').join('') ||
                'StrictScalarType' + (Math.random() * Date.now()).toString(16).replace('.', '');
        if (type === 'string') {
            options.trim = true;
            if ('nullable' in schema)
                options.nonEmpty = !schema.nullable;
        }
        switch (true) {
            case typeof schema.minimum === 'number':
            case typeof schema.minLength === 'number':
                if (type === 'string') {
                    options.minLength = schema.minLength;
                }
                if (type === 'number' || type === 'integer') {
                    options.minimum = schema.minimum;
                }
                break;
            case typeof schema.maximum === 'number':
            case typeof schema.maxLength === 'number':
                if (type === 'string') {
                    options.maxLength = schema.maxLength;
                }
                if (type === 'number' || type === 'integer') {
                    options.maximum = schema.maximum;
                }
                break;
            case typeof schema.pattern === 'string':
                const $qualifier = schema.pattern.match(/\/(.)$/) || ['', ''];
                const $pattern = schema.pattern
                    .replace(/^\//, '')
                    .replace(/\/(.)?$/, '');
                if (type === 'string') {
                    options.pattern = new RegExp($pattern, $qualifier[1]);
                }
                break;
            case typeof schema.description === 'string':
                options.description = schema.description.replace(/\s/g, '').trim();
                break;
            case type !== 'object' && type !== 'array' && type === 'boolean':
            case typeof schema.format === 'string':
            case typeof schema.enum !== 'undefined':
                const $format = schema.format || '-';
                const $enum = schema.enum || [];
                options.parse = (data) => {
                    if (type === 'string') {
                        return String(data);
                    }
                    return data;
                };
                options.coerce = (data) => {
                    if (type === 'number' || $format === 'float') {
                        if (!isFinite(data)) {
                            throw new graphql_1.GraphQLError('Float cannot represent non numeric value');
                        }
                    }
                    if (type === 'string') {
                        if (typeof data !== 'string') {
                            throw new graphql_1.GraphQLError('String cannot represent a non string value');
                        }
                    }
                    return data;
                };
                options.sanitize = (data) => {
                    return type === 'integer' || $format.startsWith('int')
                        ? parseInt(data, 10)
                        : type === 'number' || $format === 'float'
                            ? parseFloat(data)
                            : $format === 'date' || $format === 'date-time'
                                ? utils_1.isSafeDate(data) && data
                                : data;
                };
                options.validate = (data) => $format === 'int64'
                    ? utils_1.isSafeLong(data)
                    : $format === 'int32'
                        ? utils_1.isSafeInteger(data)
                        : $format === 'uuid'
                            ? utils_1.isUUID(data)
                            : $format === 'url'
                                ? utils_1.isURL(data)
                                : $enum.includes(String(data)) || utils_1.strictTypeOf(data, type);
                break;
        }
    }
    switch (def.targetGraphQLType) {
        case 'id':
            def.graphQLType = graphql_1.GraphQLID;
            break;
        case 'string':
            def.graphQLType =
                isInputObjectType && schema
                    ? graphql_scalar_1.createStringScalar(options)
                    : graphql_1.GraphQLString;
            break;
        case 'integer':
            def.graphQLType =
                isInputObjectType && schema
                    ? graphql_scalar_1.createIntScalar(options)
                    : graphql_1.GraphQLInt;
            break;
        case 'number':
            def.graphQLType =
                isInputObjectType && schema
                    ? graphql_scalar_1.createFloatScalar(options)
                    : graphql_1.GraphQLFloat;
            break;
        case 'boolean':
            def.graphQLType = graphql_1.GraphQLBoolean;
            break;
        case 'json':
            def.graphQLType = GraphQLJSON;
            break;
        default:
            throw new Error(`Cannot process schema type '${def.targetGraphQLType}'.`);
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
        const fieldSchema = fieldTypeDefinition.schema;
        // Get object type describing the property
        const objectType = getGraphQLType({
            def: fieldTypeDefinition,
            operation,
            schema: fieldSchema,
            data,
            iteration: iteration + 1,
            isInputObjectType
        });
        const requiredProperty = typeof def.required === 'object' && def.required.includes(fieldTypeKey);
        // Finally, add the object type to the fields (using sanitized field name)
        if (objectType) {
            const saneFieldTypeKey = Oas3Tools.sanitize(fieldTypeKey, !data.options.simpleNames
                ? Oas3Tools.CaseStyle.camelCase
                : Oas3Tools.CaseStyle.simple);
            const sanePropName = Oas3Tools.storeSaneName(saneFieldTypeKey, fieldTypeKey, data.saneMap);
            fields[sanePropName] = {
                type: requiredProperty
                    ? new graphql_1.GraphQLNonNull(objectType)
                    : objectType,
                description: typeof fieldSchema === 'object' ? fieldSchema.description : null
            };
        }
        else {
            utils_1.handleWarning({
                typeKey: 'CANNOT_GET_FIELD_TYPE',
                message: `Cannot obtain GraphQL type for field '${fieldTypeKey}' in ` +
                    `GraphQL type '${JSON.stringify(def.schema)}'.`,
                data,
                log: translationLog
            });
        }
    }
    if (typeof links === 'object' && // Links are present
        !isInputObjectType // Only object type (input object types cannot make use of links)
    ) {
        for (let saneLinkKey in links) {
            translationLog(`Create link '${saneLinkKey}'...`);
            // Check if key is already in fields
            if (saneLinkKey in fields) {
                utils_1.handleWarning({
                    typeKey: 'LINK_NAME_COLLISION',
                    message: `Cannot create link '${saneLinkKey}' because parent ` +
                        `object type already contains a field with the same (sanitized) name.`,
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
                    // Get arguments that are not provided by the linked operation
                    let dynamicParams = linkedOp.parameters;
                    if (typeof argsFromLink === 'object') {
                        dynamicParams = dynamicParams.filter(param => {
                            return typeof argsFromLink[param.name] === 'undefined';
                        });
                    }
                    // Get resolve function for link
                    const linkResolver = resolver_builder_1.getResolver({
                        operation: linkedOp,
                        argsFromLink: argsFromLink,
                        data,
                        baseUrl: data.options.baseUrl,
                        requestOptions: data.options.requestOptions
                    });
                    // Get arguments for link
                    const args = getArgs({
                        parameters: dynamicParams,
                        operation: linkedOp,
                        data
                    });
                    // Get response object type
                    const resObjectType = linkedOp.responseDefinition.graphQLType !== undefined
                        ? linkedOp.responseDefinition.graphQLType
                        : getGraphQLType({
                            def: linkedOp.responseDefinition,
                            operation,
                            data,
                            iteration: iteration + 1,
                            isInputObjectType: false
                        });
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
                        message: `Cannot resolve target of link '${saneLinkKey}'`,
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
    for (const parameter of parameters) {
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
        /**
         * Resolving the reference is necessary later in the code and by doing it,
         * we can avoid doing it a second time in resolveRev()
         */
        if ('$ref' in schema) {
            schema = Oas3Tools.resolveRef(schema['$ref'], operation.oas);
        }
        // TODO: remove
        const paramDef = preprocessor_1.createDataDef({ fromSchema: parameter.name }, schema, true, data);
        // @ts-ignore
        const type = getGraphQLType({
            def: paramDef,
            operation,
            schema,
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
        const saneName = Oas3Tools.sanitize(parameter.name, !data.options.simpleNames
            ? Oas3Tools.CaseStyle.camelCase
            : Oas3Tools.CaseStyle.simple);
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
            schema: requestPayloadDef.schema,
            operation,
            isInputObjectType: true // Request payloads will always be an input object type
        });
        // Sanitize the argument name
        const saneName = data.options.genericPayloadArgName
            ? 'requestBody'
            : Oas3Tools.uncapitalize(requestPayloadDef.graphQLInputObjectTypeName); // Already sanitized
        const reqRequired = typeof operation === 'object' &&
            typeof operation.payloadRequired === 'boolean'
            ? operation.payloadRequired
            : false;
        args[saneName] = {
            type: reqRequired ? new graphql_1.GraphQLNonNull(reqObjectType) : typeof requestPayloadDef.schema.default !== 'undefined' ? { type: reqObjectType, defaultValue: requestPayloadDef.schema.default } : reqObjectType,
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
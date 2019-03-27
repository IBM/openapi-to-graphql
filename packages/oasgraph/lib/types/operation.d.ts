/**
 * Type definitions for the objects created during preprocessing for every
 * operation in the OAS.
 */
import { Oas3, LinkObject, ParameterObject, ServerObject, SchemaObject } from './oas3';
import { GraphQLScalarType, GraphQLObjectType, GraphQLInputObjectType, GraphQLList, GraphQLEnumType } from 'graphql';
import { GraphQLType } from './graphql';
export declare type DataDefinition = {
    preferredName: string;
    schema: SchemaObject;
    links: {
        [key: string]: LinkObject;
    };
    otName: string;
    iotName: string;
    ot?: GraphQLObjectType | GraphQLScalarType | GraphQLList<any> | GraphQLEnumType;
    iot?: GraphQLInputObjectType | GraphQLList<any>;
};
export declare type Operation = {
    /**
     * Identifier of the operation - may be created by concatenating method & path
     */
    operationId: string;
    /**
     * Human-readable description of the operation
     */
    description: string;
    /**
     * URL path of this operation
     */
    path: string;
    /**
     * HTTP method for this operation
     */
    method: string;
    /**
     * Content-type of the request payload
     */
    payloadContentType?: string;
    /**
     * Information about the request payload (if any)
     */
    payloadDefinition?: DataDefinition;
    /**
     * Determines wheter request payload is required for the request
     */
    payloadRequired: boolean;
    /**
     * Content-type of the request payload
     */
    responseContentType?: string;
    /**
     * Information about the response payload
     */
    responseDefinition: DataDefinition;
    /**
     * The GraphQL type formed from the response definition
     */
    graphQLType?: GraphQLType;
    /**
     * List of parameters of the operation
     */
    parameters: ParameterObject[];
    /**
     * List of keys of security schemes required by this operation
     *
     * NOTE: Keys are beautified
     * NOTE: Does not contain OAuth 2.0-related security schemes
     */
    securityRequirements: string[];
    /**
     * (Local) server definitions of the operation.
     */
    servers: ServerObject[];
    /**
     * List of operations which are nested based on their path.
     */
    subOps?: Operation[];
    /**
     * Whether this operation should be placed in an authentication viewer\
     * (cannot be true if "viewer" option passed to OASGraph is false).
     */
    inViewer: boolean;
    /**
     * Whether this operation is a mutation (or a query).
     */
    isMutation: boolean;
    /**
     * The success HTTP code, 200-299, destined to become a GraphQL object type
     */
    statusCode: string;
    /**
     * The OAS which this operation originated from
     */
    oas: Oas3;
};

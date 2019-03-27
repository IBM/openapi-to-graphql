/**
 * Functions to translate JSON schema to GraphQL (input) object types.
 */
import { PreprocessingData } from './types/preprocessing_data';
import { Operation } from './types/operation';
import { Oas3, SchemaObject, ParameterObject, ReferenceObject } from './types/oas3';
import { Args, GraphQLType } from './types/graphql';
declare type GetGraphQLTypeParams = {
    name?: string;
    schema: SchemaObject | ReferenceObject;
    preferredName?: string;
    operation?: Operation;
    data: PreprocessingData;
    iteration?: number;
    isMutation?: boolean;
    oass: Oas3[];
};
declare type GetArgsParams = {
    parameters: ParameterObject[];
    payloadSchema?: SchemaObject;
    payloadSchemaName?: string;
    operation?: Operation;
    data: PreprocessingData;
    oass: Oas3[];
};
/**
 * Creates and returns a GraphQL (Input) Type for the given JSON schema.
 */
export declare function getGraphQLType({ name, schema, preferredName, operation, data, iteration, isMutation, oass, }: GetGraphQLTypeParams): GraphQLType;
/**
 * Creates an object with the arguments for resolving a GraphQL (Input) Object
 * Type
 */
export declare function getArgs({ parameters, payloadSchema, payloadSchemaName, operation, data, oass }: GetArgsParams): Args;
export {};

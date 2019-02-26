/**
 * Functions to translate JSON schema to GraphQL (input) object types.
 */
import { PreprocessingData } from './types/preprocessing_data';
import { Operation } from './types/operation';
import { Oas3, SchemaObject, ParameterObject, ReferenceObject } from './types/oas3';
import { GraphQLType, Args } from './types/graphql';
declare type GetGraphQLTypeParams = {
    name: string;
    schema: SchemaObject | ReferenceObject;
    operation?: Operation;
    data: PreprocessingData;
    oas: Oas3;
    iteration?: number;
    isMutation?: boolean;
};
declare type GetArgsParams = {
    parameters: ParameterObject[];
    payloadSchema?: SchemaObject;
    payloadSchemaName?: string;
    data: PreprocessingData;
    oas: Oas3;
    operation?: Operation;
};
/**
 * Creates and returns a GraphQL (Input) Type for the given JSON schema.
 */
export declare function getGraphQLType({ name, schema, operation, data, oas, iteration, isMutation }: GetGraphQLTypeParams): GraphQLType;
/**
 * Creates an object with the arguments for resolving a GraphQL (Input) Object
 * Type
 */
export declare function getArgs({ parameters, payloadSchema, payloadSchemaName, data, oas, operation }: GetArgsParams): Args;
export {};

/**
 * Functions to translate JSON schema to GraphQL (input) object types.
 */
import { PreprocessingData } from './types/preprocessing_data';
import { Operation, DataDefinition } from './types/operation';
import { Oas3, ParameterObject } from './types/oas3';
import { Args, GraphQLType } from './types/graphql';
declare type GetGraphQLTypeParams = {
    def: DataDefinition;
    operation?: Operation;
    data: PreprocessingData;
    iteration?: number;
    isMutation?: boolean;
    oass: Oas3[];
};
declare type GetArgsParams = {
    def?: DataDefinition;
    parameters: ParameterObject[];
    operation?: Operation;
    data: PreprocessingData;
    oass: Oas3[];
};
/**
 * Creates and returns a GraphQL (Input) Type for the given JSON schema.
 */
export declare function getGraphQLType({ def, operation, data, iteration, isMutation, oass }: GetGraphQLTypeParams): GraphQLType;
/**
 * Creates an object with the arguments for resolving a GraphQL (Input) Object
 * Type
 */
export declare function getArgs({ def, parameters, operation, data, oass }: GetArgsParams): Args;
export {};

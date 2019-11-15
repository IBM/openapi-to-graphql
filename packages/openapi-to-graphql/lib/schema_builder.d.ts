/**
 * Functions to translate JSON schema to GraphQL (input) object types.
 */
import { PreprocessingData } from './types/preprocessing_data';
import { Operation, DataDefinition } from './types/operation';
import { ParameterObject } from './types/oas3';
import { Args, GraphQLType } from './types/graphql';
declare type GetGraphQLTypeParams = {
    def: DataDefinition;
    operation?: Operation;
    data: PreprocessingData;
    iteration?: number;
    isInputObjectType?: boolean;
};
declare type GetArgsParams = {
    requestPayloadDef?: DataDefinition;
    parameters: ParameterObject[];
    operation?: Operation;
    data: PreprocessingData;
};
/**
 * Creates and returns a GraphQL (Input) Type for the given JSON schema.
 */
export declare function getGraphQLType({ def, operation, data, iteration, isInputObjectType }: GetGraphQLTypeParams): GraphQLType;
/**
 * Creates the arguments for resolving a field
 */
export declare function getArgs({ requestPayloadDef, parameters, operation, data }: GetArgsParams): Args;
export {};

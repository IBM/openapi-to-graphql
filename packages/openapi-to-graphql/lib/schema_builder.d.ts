/**
 * Functions to translate JSON schema to GraphQL (input) object types.
 */
import { PreprocessingData } from './types/preprocessing_data';
import { Operation, DataDefinition } from './types/operation';
import { ParameterObject } from './types/oas3';
import { Args } from './types/graphql';
import { GraphQLOutputType, GraphQLInputType } from 'graphql';
declare type GetArgsParams = {
    requestPayloadDef?: DataDefinition;
    parameters: ParameterObject[];
    operation?: Operation;
    data: PreprocessingData;
};
declare type CreateOrReuseComplexTypeParams = {
    def: DataDefinition;
    operation?: Operation;
    iteration?: number;
    isInputObjectType?: boolean;
    data: PreprocessingData;
};
/**
 * Creates and returns a GraphQL type for the given JSON schema.
 */
export declare function getGraphQLType({ def, operation, data, iteration, isInputObjectType }: CreateOrReuseComplexTypeParams): GraphQLOutputType | GraphQLInputType;
/**
 * Creates the arguments for resolving a field
 */
export declare function getArgs({ requestPayloadDef, parameters, operation, data }: GetArgsParams): Args;
export {};

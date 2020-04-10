/**
 * Functions to create viewers that allow users to pass credentials to resolve
 * functions used by OpenAPI-to-GraphQL.
 */
import { GraphQLObjectType as GQObjectType } from 'graphql';
import { Args, ResolveFunction, GraphQLOperationType } from './types/graphql';
import { PreprocessingData } from './types/preprocessing_data';
declare type Viewer = {
    type: GQObjectType;
    resolve: ResolveFunction;
    args: Args;
    description: string;
};
/**
 * Load the field object in the appropriate root object
 *
 * i.e. inside either rootQueryFields/rootMutationFields or inside
 * rootQueryFields/rootMutationFields for further processing
 */
export declare function createAndLoadViewer(queryFields: object, operationType: GraphQLOperationType, data: PreprocessingData): {
    [key: string]: Viewer;
};
export {};

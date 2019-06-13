import { GraphQLObjectType as GQObjectType } from 'graphql';
import { Args, ResolveFunction } from './types/graphql';
import { PreprocessingData } from './types/preprocessing_data.js';
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
export declare function createAndLoadViewer(queryFields: object, data: PreprocessingData, isMutation?: boolean): {
    [key: string]: Viewer;
};
export {};

/**
 * Functions to create viewers that allow users to pass credentials to resolve
 * functions used by OASGraph.
 */
import { Oas3 } from './types/oas3'
import { GraphQLObjectType as GQObjectType } from 'graphql'
import { Args, ResolveFunction } from './types/graphql'
import { PreprocessingData } from './types/preprocessing_data.js'
declare type Viewer = {
  type: GQObjectType
  resolve: ResolveFunction
  args: Args
  description: string
}
/**
 * Load the field object in the appropriate root object
 *
 * i.e. inside either rootQueryFields/rootMutationFields or inside
 * rootQueryFields/rootMutationFields for further processing
 */
export declare function createAndLoadViewer(
  queryFields: Object,
  data: PreprocessingData,
  isMutation: boolean,
  oass: Oas3[]
): {
  [key: string]: Viewer
}
export {}

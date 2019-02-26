/**
 * Functions to create resolve functions.
 */
import { Oas3 } from './types/oas3';
import { Operation } from './types/operation';
import { ResolveFunction } from './types/graphql';
import { PreprocessingData } from './types/preprocessing_data';
declare type GetResolverParams = {
    operation: Operation;
    argsFromLink?: {
        [key: string]: string;
    };
    argsFromParent?: string[];
    payloadName?: string;
    data: PreprocessingData;
    oas: Oas3;
    baseUrl?: string;
};
/**
 * Creates and returns a resolver function that performs API requests for the
 * given GraphQL query
 */
export declare function getResolver({ operation, argsFromLink, argsFromParent, payloadName, data, oas, baseUrl }: GetResolverParams): ResolveFunction;
export {};

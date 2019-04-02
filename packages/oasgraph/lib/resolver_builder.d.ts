import { Operation } from './types/operation';
import { ResolveFunction } from './types/graphql';
import { PreprocessingData } from './types/preprocessing_data';
import { CoreOptions } from 'request';
declare type GetResolverParams = {
    operation: Operation;
    argsFromLink?: {
        [key: string]: string;
    };
    argsFromParent?: string[];
    payloadName?: string;
    data: PreprocessingData;
    baseUrl?: string;
    requestOptions?: CoreOptions;
};
/**
 * Creates and returns a resolver function that performs API requests for the
 * given GraphQL query
 */
export declare function getResolver({ operation, argsFromLink, argsFromParent, payloadName, data, baseUrl, requestOptions }: GetResolverParams): ResolveFunction;
export {};

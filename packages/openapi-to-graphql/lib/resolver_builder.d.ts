import { ConnectOptions } from './types/options';
import { Operation } from './types/operation';
import { ResolveFunction, SubscriptionIterator } from './types/graphql';
import { PreprocessingData } from './types/preprocessing_data';
import * as NodeRequest from 'request';
declare type GetResolverParams = {
    operation: Operation;
    argsFromLink?: {
        [key: string]: string;
    };
    payloadName?: string;
    responseName?: string;
    data: PreprocessingData;
    baseUrl?: string;
    requestOptions?: NodeRequest.OptionsWithUrl;
};
declare type GetSubscribeParams = {
    operation: Operation;
    argsFromLink?: {
        [key: string]: string;
    };
    payloadName?: string;
    data: PreprocessingData;
    baseUrl?: string;
    connectOptions?: ConnectOptions;
};
export declare function getSubscribe({ operation, payloadName, data, baseUrl, connectOptions }: GetSubscribeParams): SubscriptionIterator;
export declare function getPublishResolver({ operation, argsFromLink, responseName, data }: GetResolverParams): ResolveFunction;
/**
 * If operationType is Query/Mutation, creates and returns a resolver function that performs API requests for the
 * given GraphQL query
 */
export declare function getResolver({ operation, argsFromLink, payloadName, data, baseUrl, requestOptions }: GetResolverParams): ResolveFunction;
export {};

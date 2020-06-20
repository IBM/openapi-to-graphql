/**
 * Functions to create resolve functions.
 */
import { ParameterObject } from './types/oas3';
import { ConnectOptions } from './types/options';
import { Operation } from './types/operation';
import { SubscriptionContext } from './types/graphql';
import { PreprocessingData } from './types/preprocessing_data';
import { RequestOptions } from './types/options';
import { GraphQLFieldResolver } from 'graphql';
declare type GetResolverParams<TSource, TContext, TArgs> = {
    operation: Operation;
    argsFromLink?: {
        [key: string]: string;
    };
    payloadName?: string;
    responseName?: string;
    data: PreprocessingData<TSource, TContext, TArgs>;
    baseUrl?: string;
    requestOptions?: RequestOptions<TSource, TContext, TArgs>;
};
declare type GetSubscribeParams<TSource, TContext, TArgs> = {
    operation: Operation;
    argsFromLink?: {
        [key: string]: string;
    };
    payloadName?: string;
    data: PreprocessingData<TSource, TContext, TArgs>;
    baseUrl?: string;
    connectOptions?: ConnectOptions;
};
export declare function getSubscribe<TSource, TContext, TArgs>({ operation, payloadName, data, baseUrl, connectOptions }: GetSubscribeParams<TSource, TContext, TArgs>): GraphQLFieldResolver<TSource, SubscriptionContext, TArgs>;
export declare function getPublishResolver<TSource, TContext, TArgs>({ operation, responseName, data }: GetResolverParams<TSource, TContext, TArgs>): GraphQLFieldResolver<TSource, TContext, TArgs>;
/**
 * If operationType is Query/Mutation, creates and returns a resolver function
 * that performs API requests for the given GraphQL query
 */
export declare function getResolver<TSource, TContext, TArgs>({ operation, argsFromLink, payloadName, data, baseUrl, requestOptions }: GetResolverParams<TSource, TContext, TArgs>): GraphQLFieldResolver<TSource, TContext, TArgs>;
/**
 * Extracts data from the GraphQL arguments of a particular field
 *
 * Replaces the path parameter in the given path with values in the given args.
 * Furthermore adds the query parameters for a request.
 */
export declare function extractRequestDataFromArgs<TSource, TContext, TArgs>(path: string, parameters: ParameterObject[], args: TArgs, // NOTE: argument keys are sanitized!
data: PreprocessingData<TSource, TContext, TArgs>): {
    path: string;
    qs: {
        [key: string]: string;
    };
    headers: {
        [key: string]: string;
    };
};
export {};

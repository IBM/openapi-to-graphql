/**
 * Custom type definitions for GraphQL.
 */
import { GraphQLObjectType, GraphQLScalarType, GraphQLInputObjectType, GraphQLList, GraphQLEnumType, GraphQLUnionType } from 'graphql';
export declare enum GraphQLOperationType {
    Query = 0,
    Mutation = 1,
    Subscription = 2
}
export declare type GraphQLType = GraphQLObjectType | GraphQLInputObjectType | GraphQLList<any> | GraphQLUnionType | GraphQLEnumType | GraphQLScalarType;
declare type Arg = {
    type: any;
    description?: string;
};
export declare type Args = {
    [key: string]: Arg;
};
export declare type ResolveFunction = (root: object, args: object, ctx: object, info: object) => Promise<any> | any;
declare type SubscriptionContext = {
    pubsub: any;
    [key: string]: any;
};
export declare type SubscriptionIterator = (root: object, args: object, ctx: SubscriptionContext, info?: object) => AsyncIterable<string | string[]>;
export declare type ResolveObject = {
    subscribe: SubscriptionIterator;
    resolve?: ResolveFunction;
};
export declare type Field = {
    type: GraphQLType;
    resolve?: ResolveFunction;
    subscribe?: SubscriptionIterator;
    args?: Args;
    description: string;
};
export {};

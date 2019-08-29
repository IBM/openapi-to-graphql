/**
 * Custom type definitions for GraphQL.
 */
import { GraphQLObjectType, GraphQLScalarType, GraphQLInputObjectType, GraphQLList, GraphQLEnumType, GraphQLUnionType } from 'graphql';
export declare type GraphQLType = GraphQLObjectType | GraphQLInputObjectType | GraphQLList<any> | GraphQLUnionType | GraphQLEnumType | GraphQLScalarType;
declare type Arg = {
    type: any;
    description?: string;
};
export declare type Args = {
    [key: string]: Arg;
};
export declare type ResolveFunction = (root: object, args: object, ctx: object, info: object) => Promise<any> | any;
export declare type Field = {
    type: GraphQLType;
    resolve?: ResolveFunction;
    args?: Args;
    description: string;
};
export {};

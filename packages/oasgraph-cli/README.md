# OASGraph CLI

Command line interface (CLI) for turning APIs described by OpenAPI specifications (OAS) into GraphQL interfaces.

## Installation

```bash
npm i -g oasgraph-cli
```


## Usage
The basic usage of the CLI takes the specified OAS, create a GraphQL interface for it, and start a server to host the GraphQL interface.

You can specify a local file containing the OAS specification or a remote url such as `http://127.0.0.1:3000/openapi.json`. Additionally, you can specify an optional port number so you can have multiple GraphQL servers for testing in the same machine.

```sh
oasgraph <OAS JSON file path or remote url> [port number]
```

To create the CLI tool, run:
```sh
npm link
```

Please note that the CLI tool is mainly used for quick testing and does not offer all the features that `createGraphQlSchema(oas, options)` does.

***

OASgraph can also generate and save the GraphQL schema to the local file `schema.graphql`, which you can use later to inspect or change its content. Please note that the following command will not start the GraphQL server.

```sh
oasgraph <OAS JSON file path or remote url> --save
```

For the full documentation, see the [root of this monorepo](https://github.com/strongloop/oasgraph/).

## License
[MIT](./LICENSE.md)
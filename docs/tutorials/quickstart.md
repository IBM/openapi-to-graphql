# OASGraph Quickstart tutorial

The purpose of this tutorial is to show how easy it is to use OASGraph.

With just a single command line instruction, `oasgraph [path]`, you can get a GraphQL server running.

Please note that while the CLI tool will satisfy most needs, it does not offer the flexibility or functionality of OASGraph's intended usage, as an integrated library. See the [README.md](../../README.md) for more information.

## Video demo

[![OASGraph](../conveyor_belt.png)](https://www.youtube.com/watch?v=_u7artgCqAw&feature=youtu.be "Click here to watch!")

## Do it yourself

### Have you installed Node.js?

Before you install OASGraph, make sure to download and install Node.js (version 8.9.x or higher), a JavaScript runtime.

To install Node.js, click [here](https://nodejs.org/en/download/).

### Install OASGraph

OASGraph can be used either as a library, or via its Command Line Interface (CLI). To install OASGraph, clone the repository and link the library (for the CLI commands to work) using the indicated steps.

```
git clone git@github.com:strongloop/oasgraph.git
cd oasgraph
npm link
```

### Save OAS

OASGraph relies on the OpenAPI Specification (OAS) of an existing API to create a GraphQL interface around that API.

If you use LoopBack, start your API server in the LoopBack project folder, and access the API's OAS at [http://127.0.0.1:3000/openapi.json](http://127.0.0.1:3000/openapi.json). Save the OAS to disk.

```
# in the LoopBack project folder:
npm start
```

***

If you want to generate a GraphQL interface for another API, make sure that API is running and save its OAS.

### Start GraphQL server

Once OASGraph is installed and the OAS is obtained, you can create and start the GraphQL server. The created GraphQL server is then accessible at [http://127.0.0.1:3001/graphql](http://127.0.0.1:3001/graphql).

```
oasgraph [path to saved OAS]
```

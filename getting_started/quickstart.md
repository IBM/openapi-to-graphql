# OASGraph Quickstart

## Video demo

[![Video demo](../docs/video.svg)](https://www.youtube.com/watch?v=_u7artgCqAw&feature=youtu.be)

## Write up

### Start API server

In your LoopBack application, run the following command.

```
npm start
```

***

Or boot up whichever backend that supports your API.

### Save the OAS

In your Loopback application, go [here](http://localhost:3000/openapi.json).

***

Or get whichever OAS you would like to use.


### Clone OASGraph

You can find the repository [here](https://github.com/strongloop/oasgraph).

```
git clone git@github.com:strongloop/oasgraph.git
```

### Create CLI tool

Go into the OASGraph directory...

```
cd oasgraph
```

... and build the CLI tool.

```
npm link
```

### Start GraphQL server

```
oasgraph [OAS path]
```

To see your GraphQL server, go [here](http://localhost:3001/graphql).

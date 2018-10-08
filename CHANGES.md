2018-10-08, Version 0.10.0
==========================

 * Peer dependency mistake (Alan Cha)

 * Fixed some problems with the documentation (Alan Cha)

 * feat(doc) update new features (Mario Estrada)

 * Set up Travis CI (Alan Cha)

 * Added tutorial video (Alan Cha)

 * feat(cli) add option to save schema (Mario Estrada)

 * Programmatically run example API during tests to address #39 (Erik Wittern)

 * refactor(cli) add support for remote spec file (Mario Estrada)

 * Added new tutorials (Alan Cha)

 * Reverted CLI integration (Alan Cha)

 * Revert "add travis" (Alan Cha)

 * Revert "use node 8 and above for jenkins" (Alan Cha)

 * use node 8 and above for jenkins (Diana Lau)

 * add travis (Diana Lau)

 * Removed linking from and change badge in the README (Alan Cha)

 * Integrated CLI tool into the main entry point file (Alan Cha)

 * Modified .gitignore and updated dependencies, fixed #28 (Alan Cha)

 * Added reference to research paper and badges (Alan Cha)

 * Changed back to absolute links, added image for sanitation, reworded parts of the quick start guide (Alan Cha)


2018-09-19, Version 0.9.1
=========================



2018-09-14, Version 0.9.0
=========================

 * Refactored functions (Alan Cha)

 * Added support for header parameters and cookies, related #20, fixed some naming issues associated with 9fc0273 (Alan Cha)

 * Small title change (Alan Cha)

 * Renamed file for consistency (Alan Cha)

 * Added quick start guide (Alan Cha)

 * Initial version (laredoj)

 * Added very basic cli tool (Alan Cha)


2018-09-04, Version 0.8.0
=========================

 * Removed real names from test data, fixed #87 (Alan Cha)

 * Added support for non-application/json request and support bodies (Alan Cha)

 * Delete logo.png (JOHN ERIK E. WITTERN)

 * Update README.md (JOHN ERIK E. WITTERN)

 * Delete oasgraph.pptx (JOHN ERIK E. WITTERN)

 * Deleted spurious line #86 (Alan Cha)

 * Update package.json (JOHN ERIK E. WITTERN)


2018-08-24, Version 0.7.1
=========================

 * Fixed relative links (Alan Cha)

 * Change absolute links to relative links (Alan Cha)

 * Added licensing (Alan Cha)


2018-08-23, Version 0.7.0
=========================

 * Supports 2XX status code (Alan Cha)

 * Updated dependencies, modified example OAS to comply with faulty dependency, now it does not comply with OAS 3.0.0, will update as soon as the dependency fixes issue (Alan Cha)

 * Added operationRef functionality and tests, fixed old tests, close #5 (Alan Cha)


2018-08-15, Version 0.6.1
=========================

 * Added missing devdependency (Alan Cha)


2018-08-10, Version 0.6.0
=========================

 * reflect changed beyond simple patch (Erik Wittern)

 * updated version to reflect changed dependencies (Erik Wittern)

 * replaced nodegit with isomorphic-git to fix #81 (Erik Wittern)

 * setup linting via Standard.js and linted all source files (Erik Wittern)

 * extended example API with GET /users endpoint (Erik Wittern)

 * removed unneeded ignore statements (Erik Wittern)

 * further refactorings towards #80 (Erik Wittern)

 * refactoring of index (Erik Wittern)

 * revised scripts to work with TypeScript (Erik Wittern)

 * basic replacement of Flow with TypeScript towards #80 (Erik Wittern)


2018-03-21, Version 0.5.2
=========================

 * added tests to ultimately fix #78 (Erik Wittern)

 * centering (Erik Wittern)

 * better logo placement (Erik Wittern)

 * added logo (Erik Wittern)


2018-01-30, Version 0.5.1
=========================

 * do not lowercase first char of enum values; bumped version to 0.5.1 (Erik Wittern)

 * updated evaluation results (Erik Wittern)


2018-01-25, Version 0.5.0
=========================

 * use external library to resolve allOf definitions to fix #77; bump minor version accordingly (Erik Wittern)


2018-01-25, Version 0.4.0
=========================

 * added support for int64 formatted integers to fix #76; updated minor version correspondingly (Erik Wittern)


2018-01-24, Version 0.3.1
=========================

 * fixed error where viewer option set to false was not considered properly; bumped patch version correspondingly (Erik Wittern)


2018-01-24, Version 0.3.0
=========================

 * added support for arbitrary JSON types to fix #75; bumped version to 0.3.0 correspondingly (Erik Wittern)

 * made GraphQL.js peer dependency to fix #74 (Erik Wittern)

 * added evaluation results (Erik Wittern)


2018-01-16, Version 0.2.1
=========================



2018-01-16, Version 0.1.1
=========================

 * fixed addSubOperations option; improved logging for Object Type creation; improved APIs.guru eval (Erik Wittern)

 * create suboperations only when option is set to true (Erik Wittern)

 * added further analysis of eval results (Erik Wittern)

 * fixed example GraphQL server (Erik Wittern)

 * revised evaluation script for better performance (Erik Wittern)

 * added reporting of number of successfully created queries / mutations (Erik Wittern)

 * extended comments documenting creation of placeholders (Erik Wittern)


2018-01-09, Version 0.2.0
=========================

 * minor version bump (Erik Wittern)

 * customize the names used for placeholders to fix #72 (Erik Wittern)

 * mark "query" and "mutation" as already used to fix #73 (Erik Wittern)

 * fixed issue #71 where names would collide based on convention of adding Input (Erik Wittern)

 * refactored evaluation code (Erik Wittern)

 * provided classification of errors to evaluation (Erik Wittern)

 * major revision of warnings format; basis for evaluation (Erik Wittern)

 * revised evaluation scripts (Erik Wittern)

 * updated flow versions; minor related fixes (Erik Wittern)

 * added built utils (Erik Wittern)

 * refactoring of warnings (Erik Wittern)


2017-11-28, Version 0.1.1
=========================

 * updated version number to reflect changes in relation to #69 (Erik Wittern)

 * aligned warnings further in consideration of mode to fix #69 (Erik Wittern)

 * return additional report objects, that currently tracks warnings to fix #68 (Erik Wittern)


2017-11-22, Version 0.1.0
=========================

 * First release!

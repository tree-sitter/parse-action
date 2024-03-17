# Tree-sitter parse files

## Options

```yaml
files:
  description: Glob patterns of files to be parsed
files-list:
  description: A file containing filenames to be parsed
invalid-files:
  description: Glob patterns of files that are invalid
invalid-files-list:
  description: A file containing filenames that are invalid
tree-sitter:
  description: The tree-sitter executable
  default: node_modules/.bin/tree-sitter
```

> [!NOTE]
> You must supply at least one of `files` and `files-list`.

## Example configuration

```yaml
name: Parse examples

on:
  push:
    branches: [master]
    paths:
      - grammar.js
  pull_request:
    paths:
      - grammar.js

jobs:
  examples:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install
      - uses: tree-sitter/parse-action@v3
        id: examples
        continue-on-error: true
        with:
          files: |-
            examples/**
      - uses: actions/upload-artifact@v4
        if: steps.examples.outputs.failures != ''
        with:
          name: failures
          path: ${{steps.examples.outputs.failures}}
```

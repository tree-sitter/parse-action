# Tree-sitter parse files

## Options

```yaml
files:
  description: The glob patterns of the files to parse
  required: true
tree-sitter:
  description: The tree-sitter executable
  default: node_modules/.bin/tree-sitter
```

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
      - uses: tree-sitter/parse-action@v2
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

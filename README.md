# Tree-sitter parse examples

## Options

```yaml
examples:
  description: The glob pattern of the example files
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
      - name: Checkout repository
        uses: actions/checkout@v4
      - name: Install dependencies
        run: npm install
      - name: Parse examples
        uses: tree-sitter-grammars/tree-sitter-examples-action@v1
        id: examples
        continue-on-error: true
        with:
          examples: |-
            examples/**
      - name: Upload failures artifact
        uses: actions/upload-artifact@v4
        if: steps.examples.outputs.failures != ''
        with:
          name: failures
          path: ${{steps.examples.outputs.failures}}
```

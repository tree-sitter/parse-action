import { relative } from 'node:path';
import * as action from '@actions/core'
import { create as glob } from '@actions/glob'
import { getExecOutput as exec } from '@actions/exec'

const ts = action.getInput('tree-sitter', { required: true });
const patterns = action.getInput('files', { required: true });

const files = await glob(patterns, { matchDirectories: false }).then(g => g.glob());

const cwd = process.env.GITHUB_WORKSPACE || process.cwd();

/** @type {string[]} */
const failures = [];

action.startGroup('Parsing examples');

for (let file of files.map(f => relative(cwd, f))) {
  const res = await exec(ts, ['parse', '-q', '-t', file], {
    cwd, silent: true, ignoreReturnCode: true
  });
  const summary = res.stdout.trimEnd();

  if (res.exitCode == 0) {
    action.info(summary, { file });
  } else {
    failures.push(file);
    action.error(summary, { file });
  }
}

action.endGroup();

action.summary
  .addHeading('Parsing results', 2)
  .addTable([
    [
      { data: 'Total files', header: true },
      { data: files.length.toString() }
    ],
    [
      { data: 'Successful', header: true },
      { data: (files.length - failures.length).toString() }
    ],
    [
      { data: 'Failed', header: true },
      { data: failures.length.toString() }
    ]
  ]);

if (failures.length == 0) {
  action.setOutput('failures', '');
} else {
  action.summary.addHeading('Failures', 3);
  action.summary.addList(failures);
  action.setOutput('failures', failures.join('\n'));
  action.setFailed(`Failed to parse ${failures.length}/${files.length} files`);
}

await action.summary.write();

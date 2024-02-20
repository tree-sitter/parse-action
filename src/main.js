import { relative } from 'node:path';
import * as action from '@actions/core'
import { create as glob } from '@actions/glob'
import { getExecOutput as exec } from '@actions/exec'

process.chdir(process.env.GITHUB_WORKSPACE);

const ts = action.getInput('tree-sitter', { required: true });
const examples = action.getInput('examples', { required: true });

const files = await glob(examples, { matchDirectories: false }).then(g => g.glob());

/** @type {[string, string][]} */
const failures = [];

action.startGroup('Parsing examples');

for (let f of files) {
  f = relative(process.env.GITHUB_WORKSPACE, f);
  const res = await exec(ts, ['parse', '-t', f], {
    silent: true, ignoreReturnCode: true
  });
  const out = res.stdout.split(/\r?\n/).slice(0, -1);
  const summary = out.pop();

  if (res.exitCode == 0) {
    action.info(summary, { file: f });
  } else {
    failures.push([f, out.join('\n')]);
    action.error(summary, { file: f });
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
  for (let [file, tree] of failures) {
    action.summary.addRaw(`
      <details><summary><h4>${file}</h4></summary>

      ~~~clojure
      ${tree}
      ~~~
      </details>
    `.replace(/^ {6}/mg, '').trim());
  }

  action.setOutput('failures', failures.map(f => f[0]).join('\n'));
  action.setFailed(`Failed to parse ${failures.length}/${files.length} files`);
}

await action.summary.write();

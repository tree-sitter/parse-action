import * as action from '@actions/core'
import { create as glob } from '@actions/glob'
import { getExecOutput as exec } from '@actions/exec'

const cwd = process.env.GITHUB_WORKSPACE ?? process.cwd();

/**
 * @param {string} patterns
 */
async function getFiles(patterns) {
  if (patterns.trim() == '') return [];
  const globber = await glob(patterns, { matchDirectories: false });
  return await globber.glob();
}

const ts = action.getInput('tree-sitter', { required: true });

const filePatterns = action.getMultilineInput('files', { required: true });
const invalidFiles = await getFiles(action.getInput('invalid-files'));

const invalidFilesSet = new Set(invalidFiles);

action.startGroup('Parsing files');

const res = await exec(ts, ['parse', '-q', '-t', ...filePatterns], {
  cwd, ignoreReturnCode: true
});

let totalSuccess = 0;
let totalInvalid = 0;
const failures = [];

for (const outputLine of res.stdout.trim().split('\n')) {
  const result = outputLine.trim();
  const [file] = result.split(' ', 1);
  if (result.endsWith(')')) {
    if (invalidFilesSet.has(file)) {
      action.warning(result, { file, title: 'Invalid syntax' });
      totalInvalid += 1;
    } else {
      action.error(result, { file, title: 'Parsing error' });
      failures.push(result);
    }
  } else {
    totalSuccess += 1;
  }
}

action.endGroup();

const totalFiles = totalSuccess + totalInvalid + failures.length;

action.summary
  .addHeading('Parsing results', 2)
  .addTable([
    [
      { data: 'Total files', header: true },
      { data: 'Successful', header: true },
      { data: 'Invalid syntax', header: true },
      { data: 'Parsing errors', header: true },
    ],
    [
      { data: totalFiles.toString() },
      { data: totalSuccess.toString() },
      { data: totalInvalid.toString() },
      { data: failures.length.toString() },
    ]
  ]);

await action.summary.write();

action.setOutput('failures', failures.join('\n'));

if (failures) {
  action.setFailed(`Failed to parse ${failures}/${totalFiles} files`);
}

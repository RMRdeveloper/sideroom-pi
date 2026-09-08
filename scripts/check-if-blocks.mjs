import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const sourceRoot = path.resolve('extensions');
const issues = sourceFiles(sourceRoot).flatMap(checkSourceFile);

if (issues.length > 0) {
  process.stderr.write(
    `Found ${String(issues.length)} conditional block formatting violation(s):\n${issues.join('\n')}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write('Conditional block formatting: OK\n');
}

/** Find all TypeScript implementation and test files without external glob dependencies. */
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(entryPath);
    }
    if (entry.isFile() && entry.name.endsWith('.ts')) {
      return [entryPath];
    }
    return [];
  });
}

/** Require a braced, multiline body for every TypeScript conditional. */
function checkSourceFile(file) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const fileIssues = [];

  const visit = (node) => {
    if (ts.isIfStatement(node)) {
      inspectIfStatement(node, source, fileIssues);
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return fileIssues.map(
    (message) => `${path.relative(process.cwd(), file)}: ${message}`,
  );
}

function inspectIfStatement(statement, source, fileIssues) {
  inspectConditionalBody(
    statement,
    statement.thenStatement,
    'if',
    source,
    fileIssues,
  );
  const alternative = statement.elseStatement;
  if (alternative !== undefined && !ts.isIfStatement(alternative)) {
    inspectConditionalBody(statement, alternative, 'else', source, fileIssues);
  }
}

function inspectConditionalBody(owner, body, label, source, fileIssues) {
  const position = source.getLineAndCharacterOfPosition(owner.getStart(source));
  const location = `${String(position.line + 1)}:${String(position.character + 1)}`;
  if (!ts.isBlock(body)) {
    fileIssues.push(`${location} ${label} body must use braces`);
    return;
  }

  const openingLine = source.getLineAndCharacterOfPosition(
    body.getStart(source),
  ).line;
  const closingLine = source.getLineAndCharacterOfPosition(
    body.getEnd() - 1,
  ).line;
  if (body.statements.length === 0) {
    if (closingLine === openingLine) {
      fileIssues.push(
        `${location} empty ${label} block must span multiple lines`,
      );
    }
    return;
  }

  const first = body.statements[0];
  const last = body.statements.at(-1);
  if (first === undefined || last === undefined) {
    return;
  }
  const firstLine = source.getLineAndCharacterOfPosition(
    first.getStart(source),
  ).line;
  const lastLine = source.getLineAndCharacterOfPosition(last.getEnd()).line;
  if (firstLine <= openingLine || closingLine <= lastLine) {
    fileIssues.push(
      `${location} ${label} block body and closing brace must be on their own lines`,
    );
  }
}

/** What counts as a test file, an assertion, a skipped test, a TODO, and a stub. */

const TEST_PATH_PATTERNS: readonly RegExp[] = [
  /(^|\/)(tests?|__tests__|specs?|test_?suite)\//i,
  /\.(test|spec)\.[cm]?[jt]sx?$/,
  /(^|\/)test_[^/]+\.py$/,
  /_test\.(py|go|rb|exs?)$/,
  /_spec\.rb$/,
  /(Test|Tests|IT|Spec)\.(java|kt|scala|cs|swift|php)$/,
  /(^|\/)conftest\.py$/,
];

export function isTestFile(path: string): boolean {
  return TEST_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

/** Matches one assertion call. Used with the global flag to count several per line. */
export const ASSERTION =
  /\bexpect\s*\(|\bassert\w*!?\s*\(|^\s*assert\b|\bAssert\.\w+\s*\(|\bt\.(?:Error|Errorf|Fatal|Fatalf|Fail|FailNow)\b|\b(?:require|assert)\.\w+\s*\(|\.should\b|\bpytest\.raises\s*\(|\bverify\s*\(/g;

export function countAssertions(text: string): number {
  return [...text.matchAll(ASSERTION)].length;
}

const SKIP =
  /\b(?:it|test|describe|context|suite|specify)\.(?:skip|todo)\s*\(|\b(?:xit|xtest|xdescribe|xcontext|xspecify)\s*\(|@pytest\.mark\.skip(?:if)?\b|@unittest\.skip\w*|\bpytest\.skip\s*\(|@Disabled\b|@Ignore\b|\bt\.Skip(?:f|Now)?\s*\(|\[(?:Fact|Theory|Test)\s*\([^)]*\bSkip\s*=|\[Ignore\b|#\[ignore\]|^\s*skip\s*(?:\(|["'])/;

export function isSkip(text: string): boolean {
  return SKIP.test(text);
}

const TODO = /\b(?:TODO|FIXME)\b/;

export function isTodo(text: string): boolean {
  return TODO.test(text);
}

const STUB_STATEMENTS: readonly RegExp[] = [
  /\braise\s+NotImplementedError\b/,
  /\bthrow\s+new\s+Error\s*\(\s*["'`](?:not\s+(?:yet\s+)?implemented|todo|unimplemented)\b/i,
  /\bthrow\s+new\s+NotImplementedException\b/,
  /\bthrow\s+new\s+UnsupportedOperationException\s*\(\s*"(?:not\s+(?:yet\s+)?implemented|todo)/i,
  /\b(?:unimplemented|todo)!\s*\(/,
  /\bpanic\s*\(\s*"(?:not\s+(?:yet\s+)?implemented|todo|unimplemented)/i,
];

export function stubStatement(text: string): boolean {
  return STUB_STATEMENTS.some((pattern) => pattern.test(text));
}

export const PYTHON_DEF = /^(\s*)(?:async\s+)?def\s+\w+\s*\(.*$/;
export const PYTHON_ONE_LINE_STUB = /^\s*(?:async\s+)?def\s+\w+\s*\(.*\)\s*(?:->\s*[^:]+)?:\s*(?:pass|\.\.\.)\s*(?:#.*)?$/;
export const PYTHON_ABSTRACT_DECORATOR = /^\s*@(?:abc\.)?(?:abstractmethod|abstractproperty|overload|typing\.overload)\b/;

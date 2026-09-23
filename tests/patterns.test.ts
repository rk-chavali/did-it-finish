import { describe, expect, it } from "vitest";

import { countAssertions, isSkip, isTestFile, isTodo, stubStatement } from "../src/patterns.js";

describe("isTestFile", () => {
  it.each([
    "src/cart.test.ts",
    "src/cart.spec.jsx",
    "tests/helpers.py",
    "pkg/__tests__/a.js",
    "test_orders.py",
    "orders_test.go",
    "spec/models/user_spec.rb",
    "src/test/java/com/acme/OrderTest.java",
    "Acme.Tests/OrderTests.cs",
    "tests/conftest.py",
  ])("%s is a test file", (path) => {
    expect(isTestFile(path)).toBe(true);
  });

  it.each(["src/contest.ts", "src/latest.py", "src/testing-utils.ts", "docs/testimonials.md"])(
    "%s is not a test file",
    (path) => {
      expect(isTestFile(path)).toBe(false);
    },
  );
});

describe("countAssertions", () => {
  it.each([
    ["expect(a).toBe(1); expect(b).toBe(2);", 2],
    ["    assert result == 3", 1],
    ["self.assertEqual(a, b)", 1],
    ["assertThat(list).hasSize(2);", 1],
    ["Assert.AreEqual(1, x);", 1],
    ['if err != nil { t.Fatalf("boom") }', 1],
    ["require.NoError(t, err)", 1],
    ["assert_eq!(a, b);", 1],
    ["with pytest.raises(ValueError):", 1],
    ["const assertion = build();", 0],
  ])("%s has %d", (line, count) => {
    expect(countAssertions(line)).toBe(count);
  });
});

describe("isSkip", () => {
  it.each([
    'it.skip("x", () => {})',
    'test.todo("later")',
    'xit("x", () => {})',
    "@pytest.mark.skipif(sys.platform == 'win32', reason='posix only')",
    "@unittest.skipUnless(HAS_DB, 'needs db')",
    "@Disabled",
    't.Skip("flaky")',
    '[Fact(Skip = "flaky")]',
    "#[ignore]",
    '  skip "not ready"',
  ])("%s is a skip", (line) => {
    expect(isSkip(line)).toBe(true);
  });

  it.each(["const skipped = items.skip(2);", "if (shouldSkip) return;"])("%s is not a skip", (line) => {
    expect(isSkip(line)).toBe(false);
  });
});

describe("isTodo and stubStatement", () => {
  it("matches TODO and FIXME as words", () => {
    expect(isTodo("// TODO: x")).toBe(true);
    expect(isTodo("# FIXME later")).toBe(true);
    expect(isTodo("const todoItems = []")).toBe(false);
  });

  it.each([
    "raise NotImplementedError",
    "raise NotImplementedError('soon')",
    'throw new Error("not yet implemented")',
    "throw new Error('TODO')",
    "throw new NotImplementedException();",
    'throw new UnsupportedOperationException("Not implemented");',
    "unimplemented!()",
    "todo!()",
    'panic("not implemented")',
  ])("%s is a stub", (line) => {
    expect(stubStatement(line)).toBe(true);
  });

  it("does not flag real errors", () => {
    expect(stubStatement('throw new Error("payment declined")')).toBe(false);
    expect(stubStatement("raise ValueError('bad')")).toBe(false);
  });
});

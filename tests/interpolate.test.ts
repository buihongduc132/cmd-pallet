import { describe, it, expect } from "vitest";
import { interpolate, buildInvocation } from "../src/interpolate.ts";

describe("String Interpolation and Safety", () => {
  describe("interpolate placeholders", () => {
    it("substitutes $ARGUMENTS with full argument string", () => {
      const template = "echo $ARGUMENTS";
      const result = interpolate(template, "hello world --flag");
      expect(result).toBe("echo hello world --flag");
    });

    it("substitutes $@ with full argument string", () => {
      const template = "run $@";
      const result = interpolate(template, "alpha beta gamma");
      expect(result).toBe("run alpha beta gamma");
    });

    it("substitutes {{args}} with full argument string", () => {
      const template = "execute {{args}}";
      const result = interpolate(template, "foo bar");
      expect(result).toBe("execute foo bar");
    });

    it("substitutes $1 through $9 with whitespace-separated tokens", () => {
      const template = "first: $1, second: $2, third: $3, ninth: $9";
      const result = interpolate(template, "one two three four five six seven eight nine");
      expect(result).toBe("first: one, second: two, third: three, ninth: nine");
    });

    it("replaces missing positional arguments with empty string", () => {
      const template = "first: $1, second: $2, third: $3";
      const result = interpolate(template, "only_one");
      expect(result).toBe("first: only_one, second: , third: ");
    });

    it("handles slice syntax ${@:start} and ${@:start:len}", () => {
      const template1 = "rest: ${@:2}";
      const result1 = interpolate(template1, "a b c d e");
      expect(result1).toBe("rest: b c d e");

      const template2 = "middle: ${@:2:2}";
      const result2 = interpolate(template2, "a b c d e");
      expect(result2).toBe("middle: b c");
    });

    it("handles $10 as $1 followed by literal 0", () => {
      const template = "val: $10";
      const result = interpolate(template, "first");
      expect(result).toBe("val: first0");
    });

    it("handles empty or null args gracefully", () => {
      expect(interpolate("echo $ARGUMENTS", "")).toBe("echo ");
      expect(interpolate("echo $1", "")).toBe("echo ");
      expect(interpolate(null as any, "args")).toBe("");
    });
  });

  describe("Replacer Function Safety ($&, $', $`, $$ regression)", () => {
    it("does not expand '$&' in args as match replacer", () => {
      const template = "Received: $ARGUMENTS";
      const userArg = "price is $& bonus";
      const result = interpolate(template, userArg);
      expect(result).toBe("Received: price is $& bonus");
    });

    it("does not expand '$`' in args as preceding text replacer", () => {
      const template = "PREFIX $1 SUFFIX";
      const userArg = "a$`b";
      const result = interpolate(template, userArg);
      expect(result).toBe("PREFIX a$`b SUFFIX");
    });

    it("does not expand '$'' in args as following text replacer", () => {
      const template = "PREFIX $1 SUFFIX";
      const userArg = "a$'b";
      const result = interpolate(template, userArg);
      expect(result).toBe("PREFIX a$'b SUFFIX");
    });

    it("does not collapse '$$' in args into single '$'", () => {
      const template = "Cost: $ARGUMENTS";
      const userArg = "$$100 dollars";
      const result = interpolate(template, userArg);
      expect(result).toBe("Cost: $$100 dollars");
    });
  });

  describe("buildInvocation", () => {
    it("formats invocation with slash prefix and arguments", () => {
      expect(buildInvocation("deploy", "prod --force")).toBe("/deploy prod --force");
      expect(buildInvocation("/deploy", "prod")).toBe("/deploy prod");
      expect(buildInvocation("status", "")).toBe("/status");
      expect(buildInvocation("status", "   ")).toBe("/status");
    });
  });
});

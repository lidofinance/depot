import { assert } from "chai";
import { JsonBuilder } from "../../src/traces/json-builder";

describe("JsonBuilder", () => {
  let builder = new JsonBuilder();

  afterEach(() => {
    builder = new JsonBuilder();
  });

  describe("build()", () => {
    it("empty object", () => {
      builder.openObject().closeObject();
      assert.deepEqual({}, builder.build());
    });

    it("Empty array", () => {
      assert.deepEqual([], builder.openArray().closeArray().build());
    });

    it("simple object", () => {
      assert.deepEqual({ foo: "baz" }, builder.openObject().key("foo").value("baz").closeObject().build());
    });

    it("list of values", () => {
      assert.deepEqual(
        ["foo", 1, false, null],
        builder.openArray().value("foo").value(1).value(false).value(null).closeArray().build(),
      );
    });

    it("list of simple objects", () => {
      assert.deepEqual(
        [{ foo: "baz" }, { key1: 1, key2: null, key3: false }],
        // prettier-ignore
        builder
          .openArray()
            .openObject()
              .key("foo").value("baz")
            .closeObject()
            .openObject()
              .key("key1").value(1)
              .key("key2").value(null)
              .key("key3").value(false)
            .closeObject()
          .closeArray()
        .build(),
      );
    });

    it("list of lists", () => {
      assert.deepEqual(
        [[], [], [[], [true], [1]]],
        // prettier-ignore
        builder
          .openArray()
            .openArray().closeArray()
            .openArray().closeArray()
            .openArray()
              .openArray().closeArray()
              .openArray().value(true).closeArray()
              .openArray().value(1).closeArray()
            .closeArray()
          .closeArray()
        .build(),
      );
    });

    it("escapes double quotes in string values", () => {
      const withQuote = 'say "hi"';
      assert.deepEqual({ msg: withQuote }, builder.openObject().key("msg").value(withQuote).closeObject().build());
    });

    it("escapes backslashes in string values", () => {
      const withBackslash = "path\\to\\file";
      assert.deepEqual(
        { path: withBackslash },
        builder.openObject().key("path").value(withBackslash).closeObject().build(),
      );
    });

    it("escapes newlines and tabs in string values", () => {
      const withControlChars = "line1\nline2\tcol";
      assert.deepEqual(
        { text: withControlChars },
        builder.openObject().key("text").value(withControlChars).closeObject().build(),
      );
    });

    it("escapes special characters in keys", () => {
      const trickyKey = 'key"with\\special\nchars';
      assert.deepEqual({ [trickyKey]: 1 }, builder.openObject().key(trickyKey).value(1).closeObject().build());
    });

    it("handles empty string value", () => {
      assert.deepEqual({ empty: "" }, builder.openObject().key("empty").value("").closeObject().build());
    });
  });

  describe("pop()", () => {
    it("empty object", () => {
      builder.openObject().closeObject();
      assert.deepEqual({}, builder.pop());
    });

    it("Empty array", () => {
      assert.deepEqual([], builder.openArray().closeArray().pop());
    });

    it("simple object", () => {
      assert.deepEqual({ foo: "baz" }, builder.openObject().key("foo").value("baz").closeObject().pop());
    });

    it("list of values", () => {
      assert.deepEqual(
        ["foo", 1, false, null],
        builder.openArray().value("foo").value(1).value(false).value(null).closeArray().pop(),
      );
    });

    it("list of simple objects", () => {
      assert.deepEqual(
        [{ foo: "baz" }, { key1: 1, key2: null, key3: false }],
        // prettier-ignore
        builder
          .openArray()
            .openObject()
              .key("foo").value("baz")
            .closeObject()
            .openObject()
              .key("key1").value(1)
              .key("key2").value(null)
              .key("key3").value(false)
            .closeObject()
          .closeArray()
        .pop(),
      );

      // prettier-ignore
      const partialObjectBuilder = builder
      .openArray()
        .openObject()
          .key("foo").value("baz")
        .closeObject()
        .openObject()
          .key("key1").value(1)
          .key("key2").value(null)
          .key("key3").value(false)
        .closeObject()

      // pop object from the middle of the array
      assert.deepEqual({ key1: 1, key2: null, key3: false }, partialObjectBuilder.pop());
      assert.deepEqual({ foo: "baz" }, partialObjectBuilder.pop());
      assert.deepEqual([], partialObjectBuilder.closeArray().pop());
    });

    it("list of lists", () => {
      assert.deepEqual(
        [[], [], [[], [true], [1]]],
        // prettier-ignore
        builder
          .openArray()
            .openArray().closeArray()
            .openArray().closeArray()
            .openArray()
              .openArray().closeArray()
              .openArray().value(true).closeArray()
              .openArray().value(1).closeArray()
            .closeArray()
          .closeArray()
        .pop(),
      );

      // prettier-ignore
      const partialArrayBuilder = builder
        .openArray()
        .openArray().closeArray()
        .openArray().closeArray()
        .openArray()
          .openArray().closeArray()
          .openArray().value(true).closeArray()
          .openArray().value(1).closeArray()
        .closeArray()

      assert.deepEqual([[], [true], [1]], partialArrayBuilder.pop());
      assert.deepEqual([], partialArrayBuilder.pop());
      assert.deepEqual([[]], partialArrayBuilder.closeArray().pop());
    });

    it("nested objects", () => {
      const sample = { root: { child: { key1: "value1", key2: true } } };
      // prettier-ignore
      const partialSampleBuilder = builder
        .openObject()
          .key("root")
            .openObject()
              .key("child")
                .openObject()
                  .key("key1").value("value1")
                  .key("key2").value(true)
                .closeObject()
            .closeObject()
      // .closeObject()

      // null - because top object is part of the larger object
      assert.equal(null, partialSampleBuilder.pop());
      partialSampleBuilder.closeObject();
      assert.deepEqual(sample, partialSampleBuilder.pop());
    });
  });
});

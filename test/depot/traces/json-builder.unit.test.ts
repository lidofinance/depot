import { assert } from "chai";
import { JsonBuilder } from "@/src/traces/json-builder";

describe("JsonBuilder", () => {
  let builder = new JsonBuilder();

  afterEach(() => {
    builder = new JsonBuilder();
  });

  describe("build()", () => {
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
  });

  describe("pop()", () => {
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

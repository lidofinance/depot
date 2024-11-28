import { assert } from "chai";
import { JsonBuilder } from "./json-builder";

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
      let partialObjectBuilder = builder
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
      let partialArrayBuilder = builder
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
      let partialSampleBuilder = builder
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

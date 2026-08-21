import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The loader is a plain script served to publishers, so it cannot import
// anything. These read it as text — the only way to assert on it.

const ROOT = join(import.meta.dirname, "..");
const js = () => readFileSync(join(ROOT, "public/embed.js"), "utf8");

describe("embed.js loader", () => {
  test("supports data-campaign-group", () => {
    // Without this a group script tag builds /embed? with no parameters at all.
    assert.match(js(), /"campaign_group"/);
  });

  test("the attribute list is unchanged for every pre-existing parameter", () => {
    const s = js();
    for (const a of ["campaign", "survey", "publisher", "placement", "placement_id",
                     "creative_id", "club", "competition", "country", "segment"]) {
      assert.match(s, new RegExp(`"${a}"`), `${a} must remain supported`);
    }
  });

  test("it does NOT accept the legacy `group` attribute", () => {
    // Legacy groups have never had a script tag, and adding one is not part of
    // this work — legacy delivery stays exactly as it is.
    assert.ok(!/"group"/.test(js()));
  });

  test("a parameter is only set when its attribute is present", () => {
    // This is what makes adding to the list safe for every existing tag.
    assert.match(js(), /if \(val\) params\.set\(attr, val\)/);
  });

  test("the Deploy tag and the loader agree on the attribute name", () => {
    const tags = readFileSync(join(ROOT, "app/components/studio/create/deploy/DeployGroupTags.tsx"), "utf8");
    assert.match(tags, /data-campaign-group=/);
    // dash in the attribute, underscore in the query parameter — the loader
    // converts between them, and a mismatch here silently drops the parameter.
    assert.match(js(), /attr\.replace\(\/_\/g, "-"\)/);
    assert.match(tags, /embed\?campaign_group=/);
  });
});

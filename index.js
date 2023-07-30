import core from "@actions/core";
import path from "path";
import { simpleGit } from "simple-git";
import fs from "fs/promises";

function isJSON(jsonString) {
  try {
    const o = JSON.parse(jsonString);
    if (o && typeof o === "object") {
      return o;
    }
  } catch (e) {}
  return false;
}

try {
  const workspace = process.env["GITHUB_WORKSPACE"];
  const trackedFiles = core.getMultilineInput("tracked-files");
  const origin = core.getInput("origin");
  const dest = core.getInput("destination");

  const gitOrigin = simpleGit(path.join(workspace, origin));
  const gitDest = simpleGit(path.join(workspace, dest));
  const destRefs = await gitDest.show("REFS");
  for (const trackedFile of trackedFiles) {
    const trackedObject = JSON.parse(await gitDest.show(trackedFile));
    const logResult = await gitOrigin.log({
      file: trackedFile,
      from: destRefs,
    });
    for (const log of logResult.all.slice().reverse()) {
      const data = await gitOrigin.show(`${log.refs}:${trackedFile}`);
      if (isJSON(data)) {
        Object.assign(trackedObject, JSON.parse(data));
      }
    }
    await fs.writeFile(
      path.join(workspace, dest, trackedFile),
      JSON.stringify(trackedObject),
    );
  }
} catch (error) {
  core.setFailed(error);
}

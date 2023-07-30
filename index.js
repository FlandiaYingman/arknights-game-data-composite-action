const core = require("@actions/core");
const path = require("path");
const { simpleGit } = require("simple-git");
const fs = require("fs/promises");

function isJSON(jsonString) {
  try {
    const o = JSON.parse(jsonString);
    if (o && typeof o === "object") {
      return o;
    }
  } catch (e) {}
  return false;
}

(async function () {
  try {
    const workspace = process.env["GITHUB_WORKSPACE"];
    const trackedFiles = core.getMultilineInput("tracked-files");
    const origin = core.getInput("origin");
    const dest = core.getInput("dest");

    const gitOrigin = simpleGit(path.join(workspace, origin));
    const gitDest = simpleGit(path.join(workspace, dest));
    const destRefs = await gitDest.show("REFS");
    for (const trackedFile of trackedFiles) {
      const trackedFileDestPath = path.join(workspace, dest, trackedFile);
      const trackedFileDestExists = await fs
        .access(trackedFileDestPath, fs.constants.F_OK)
        .then(() => true)
        .catch(() => false);
      const trackedObject = trackedFileDestExists ? JSON.parse(await gitDest.show(trackedFile)) : {};
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
      await fs.mkdir(trackedFileDestPath, { recursive: true });
      await fs.writeFile(trackedFileDestPath, JSON.stringify(trackedObject));
    }
  } catch (error) {
    core.setFailed(error);
  }
})();

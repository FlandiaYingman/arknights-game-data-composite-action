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

async function exists(git, path) {
  try {
    await git.catFile(["-e", path]);
    return true;
  } catch {
    return false;
  }
}

(async function () {
  try {
    const workspace = process.env["GITHUB_WORKSPACE"];
    const trackedFiles = core.getMultilineInput("tracked-files");
    const origin = core.getInput("origin");
    const dest = core.getInput("dest");

    const gitOrigin = simpleGit(path.join(workspace, origin));
    const gitDest = simpleGit(path.join(workspace, dest));

    const rev = await gitDest.show("HEAD:REV");
    for (const trackedFile of trackedFiles) {
      const trackedFileDestPath = path.join(workspace, dest, trackedFile);
      const trackedObject = (await exists(gitDest, `HEAD:${trackedFile}`))
        ? JSON.parse(await gitDest.show(`HEAD:${trackedFile}`))
        : {};
      const logResult = await gitOrigin.log({
        file: trackedFile,
        from: rev,
      });
      for (const log of logResult.all.slice().reverse()) {
        if (await exists(gitOrigin, `${log.hash}:${trackedFile}`)) {
          const data = await gitOrigin.show(`${log.hash}:${trackedFile}`);
          if (isJSON(data)) {
            Object.assign(trackedObject, JSON.parse(data));
          }
        }
      }
      await fs.mkdir(path.dirname(trackedFileDestPath), { recursive: true });
      await fs.writeFile(trackedFileDestPath, JSON.stringify(trackedObject, null, 2));
    }
  } catch (error) {
    core.setFailed(error.stack);
  }
})();

const express = require("express");
const router = express.Router();
const { testUrl, referenceUrl, type } = req.body

let reportFolder = "ui" // default

if (type === "fullsite") {
  reportFolder = "fullsite"
}

console.log("REPORT FOLDER:", reportFolder)

const {
  runUiTest
} = require("../controllers/testController");

router.post("/run-ui-test", runUiTest);

module.exports = router;
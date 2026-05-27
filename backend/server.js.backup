
const express = require("express")
const { spawn } = require("child_process")
const path = require("path")
const fs = require("fs-extra")
const { chromium } = require("playwright")
const cors = require("cors")

const app = express()


const http = require("http")

const { Server } = require("socket.io")

const server = http.createServer(app)

const io = new Server(server, {
    cors: {
        origin: "*"
    }
})

app.use(express.json())
app.use(cors())

app.use(
    "/reports",
    express.static(
        path.join(__dirname, "../backstopproject/reports")
    )
)



app.post("/run-ui-test", async (req, res) => {
  
    const { testUrl, referenceUrl, type } = req.body;
  
    console.log("TYPE:", type); // 👈 debug this first

  // ✅ STEP 1: ADD HERE (just after req.body)
  
  let outputPath = ""

  if (type === "fullsite") {
    outputPath = "fullsite-tests"
  } else if (type === "ui") {
    outputPath = "ui-tests"
  } else if (type === "seo") {
    outputPath = "SEO"
  } else if (type === "sitemap") {
    outputPath = "SITEMAP"
  }
  
  console.log("📁 Report Path:", outputPath)
  
    
    console.log("TYPE RECEIVED:", type)
    

    // Path to your Backstop project
    const backstopProjectPath = path.join(__dirname, "../backstopproject")
    const timestamp = new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\..+/, "")

    let args = []

switch (type) {
  case "fullsite":
    args = referenceUrl?.trim()
      ? ["runFullSiteUI.js", testUrl, referenceUrl]
      : ["runFullSiteUI.js", testUrl]
    break

  case "ui":
    args = referenceUrl?.trim()
      ? ["runSingleURLref.js", testUrl, referenceUrl]
      : ["runSingleURL.js", testUrl]
    break

  case "seo":
    args = ["runSeo.js", testUrl]
    break

  case "sitemap":
    args = ["runSitemap.js", testUrl]
    break

  default:
    return res.status(400).json({
      message: "Invalid test type"
    })
}
const child = spawn("node", args, {
  cwd: backstopProjectPath
})
      
      let logs = ""
      
      // ✅ REAL-TIME STDOUT
      child.stdout.on("data", (data) => {
        const msg = data.toString()
        logs += msg
        console.log(msg)
        io.emit("live-log", msg)
      })
      
      // ✅ REAL-TIME STDERR
      child.stderr.on("data", (data) => {
        const msg = data.toString()
        logs += msg
        console.log(msg)
        io.emit("live-log", msg)
      })
      
      // ✅ WHEN PROCESS ENDS
      child.on("close", async () => {
        let status = "passed"
        let isExecutionFailed = false
        
        // ❌ HARD FAIL (command crash)
        if (
            logs.includes("Command failed") ||
            logs.includes("Pipeline failed: Command failed: backstop reference") ||
            logs.includes("Protocol error") ||
            logs.includes("Cannot navigate") ||
            logs.includes("ERR_") ||
            logs.includes("npm ERR")
          ) {
          isExecutionFailed = true
        }
        
        // ⚠️ UI MISMATCH FAIL
        else if (
          
          logs.includes("Mismatch errors found") ||
          logs.includes("0 Passed")||
          logs.includes("Backstop test failed (expected), continuing...")

        ) {
          status = "failed"
        }
      
        // ❌ HARD FAIL
        if (isExecutionFailed) {
          return res.json({
            status: "execution_failed",
            logs
          })
        }

        const failMatch = logs.match(/(\d+)\s+Failed/)

        console.log("FINAL STATUS:", isExecutionFailed ? "execution_failed" : status)

        if (failMatch && parseInt(failMatch[1]) > 0) {
          status = "failed"
        }
        // ✅ NORMAL FLOW
        try {
            const baseFolder =
  type === "fullsite"
    ? "fullsite-tests"
    : type === "seo"
      ? "SEO"
      : type === "sitemap"
        ? "SITEMAP"
        : "ui-tests"

    const reportDestination = path.join(
      __dirname,
      `../backstopproject/reports/${baseFolder}`,
      timestamp
    )
      
          fs.ensureDirSync(reportDestination)
      
          const htmlReportPath = path.join(
            __dirname,
            "../backstopproject/qa-report.html"
          )
      
          const pdfPath = path.join(
            reportDestination,
            "report.pdf"
          )
      
          const browser = await chromium.launch()
          const page = await browser.newPage()
      
          await page.goto(`file://${htmlReportPath}`, {
  waitUntil: "load"
})
      
          await page.pdf({
            path: pdfPath,
            format: "A4",
            printBackground: true
          })
      
          await browser.close()
      
          const historyFilePath = path.join(
            __dirname,
            "../backstopproject/reports/history.json"
          )
      
          let historyData = []

if (fs.existsSync(historyFilePath)) {
  historyData = fs.readJsonSync(historyFilePath)
}
      
          const newHistory = {
            id: Date.now(),
            timestamp,
            testUrl,
            referenceUrl: referenceUrl || "",
           pdfPath: `reports/${baseFolder}/${timestamp}/report.pdf`,
            status,
            type
          }
      
          historyData.unshift(newHistory)
      
          fs.writeJsonSync(historyFilePath, historyData, { spaces: 2 })
      
          return res.json({
            message: "Backstop test completed",
            status,
            reportUrl: `http://localhost:5000/reports/${baseFolder}/${timestamp}/report.pdf`
          })
      
        } catch (e) {
          console.log("PDF Error", e)
      
          return res.status(500).json({
            status: "execution_failed",
            logs
          })
        }
      })

})


app.get("/history", (req, res) => {

    try {

        const historyFilePath = path.join(
            __dirname,
            "../backstopproject/reports/history.json"
        )

        const historyData = fs.readJsonSync(historyFilePath)

        res.json(historyData)

    } catch (e) {

        console.log("History Read Error")
        console.log(e)

        res.status(500).send("Failed to load history")

    }

})



server.listen(5000, () => {

    console.log("Server running on port 5000")

})


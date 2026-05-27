const runComparison = require("../services/runComparison");

exports.runUiTest = async (req, res) => {
  try {
    const { testUrl, referenceUrl, type } = req.body

    if (!testUrl || !referenceUrl) {
      return res.status(400).json({
        success: false,
        message: "Both URLs are required"
      });
    }

    const result = await runComparison({
      testUrl,
      referenceUrl
    });

    res.json({
      success: true,
      result
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};
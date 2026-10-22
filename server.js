const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

const app = express();

const upload = multer({
  dest: "uploads/"
});

app.use(express.static("public"));

// Get the YAML file from the user
app.post("/upload", upload.single("yaml"), (req, res) => {
  const uploadedFile = req.file.path;

  const outputFile =
    `generated/${Date.now()}.html`;

  const cmd =
    `redocly build-docs ${uploadedFile} -o ${outputFile}`;

  // Execute the redocly command
  exec(cmd, (error, stdout, stderr) => {

    if (error) {
      return res.status(500).json({
        success: false,
        error: stderr
      });
    }

    res.json({
      success: true,
      url: `/${outputFile}`
    });

  });
});

// Share the HTML file with the user
app.use("/generated", express.static("generated"));

// Listener
app.listen(3000, () => {
  console.log("Running on http://localhost:3000");
});


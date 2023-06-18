// Import the AWS SDK
const AWS = require("aws-sdk");
const fs = require("fs");

// Configure the AWS region
AWS.config.update({ region: "us-east-1" }); // replace with your target AWS region

// Create an S3 client
const s3 = new AWS.S3();

// Define the S3 bucket and key
const Bucket = "s3-function-sunpy";
const Key = "folder-upload.zip";

// Create a write stream for the local file
const localFileStream = fs.createWriteStream("./output.zip");

// Create an S3 stream
const s3Stream = s3.getObject({ Bucket, Key }).createReadStream();

// Pipe the S3 stream to the local file stream
s3Stream
  .pipe(localFileStream)
  .on("error", (err) => {
    console.error("Error downloading the file.");
    console.error(err);
  })
  .on("close", () => {
    console.log("Successfully downloaded the file.");
  });

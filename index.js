const AWS = require("aws-sdk");
const s3 = new AWS.S3();
const unzipper = require("unzipper");
const fs = require("fs");
const path = require("path");

exports.handler = async (event) => {
  console.log("Received event:", JSON.stringify(event));

  const Bucket = event.Records[0].s3.bucket.name;
  const Key = decodeURIComponent(
    event.Records[0].s3.object.key.replace(/\+/g, " ")
  );
  const newKey = Key.replace(".zip", "");

  console.log(`Bucket: ${Bucket}, Key: ${Key}, newKey: ${newKey}`);

  console.log("Start getting object from S3");

  const tempFilePath = path.join("/tmp", Key);

  const writeStream = fs.createWriteStream(tempFilePath);
  const s3Stream = s3.getObject({ Bucket, Key }).createReadStream();

  // Use Promise to make sure the unzip process is done before ending the lambda function
  await new Promise((resolve, reject) => {
    s3Stream
      .on("error", (error) => reject(`Error with s3Stream: ${error}`))
      .pipe(writeStream)
      .on("error", (error) => reject(`Error with writeStream: ${error}`))
      .on("close", () => {
        console.log(`Finish getting object from S3, saved to ${tempFilePath}`);

        fs.createReadStream(tempFilePath)
          .pipe(unzipper.Parse())
          .on("error", (error) => reject(`Error with unzipper: ${error}`))
          .on("entry", async function (entry) {
            const fileName = entry.path;
            const type = entry.type; // 'Directory' or 'File'
            const size = entry.size;

            console.log(
              `Processing entry - fileName: ${fileName}, type: ${type}, size: ${size}`
            );

            if (type === "File") {
              console.log(`Uploading file: ${fileName} to bucket: ${Bucket}`);
              await s3
                .upload({
                  Bucket,
                  Key: `${newKey}/${fileName}`,
                  Body: entry,
                })
                .promise();
              console.log(`Uploaded file: ${fileName} to bucket: ${Bucket}`);
            } else {
              console.log(`Ignoring directory: ${fileName}`);
              entry.autodrain();
            }
          })
          .on("finish", () => resolve()); // Resolve the promise when unzip process is finished
      });
  });

  console.log("Lambda function is about to end");
  return {
    statusCode: 200,
    body: JSON.stringify("Done!"),
  };
};

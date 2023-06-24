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

  let tree = {};

  // Use Promise to make sure the unzip process is done before ending the lambda function
  await new Promise((resolve, reject) => {
    let uploadPromises = [];
    s3Stream
      .on("error", (error) => reject(`Error with s3Stream: ${error}`))
      .pipe(writeStream)
      .on("error", (error) => reject(`Error with writeStream: ${error}`))
      .on("close", () => {
        console.log(`Finish getting object from S3, saved to ${tempFilePath}`);

        fs.createReadStream(tempFilePath)
          .pipe(unzipper.Parse())
          .on("error", (error) => reject(`Error with unzipper: ${error}`))
          .on("entry", function (entry) {
            const processingPromise = (async () => {
              const fileName = entry.path;
              const type = entry.type; // 'Directory' or 'File'
              const size = entry.size;

              if (
                fileName.startsWith("__MACOSX/") ||
                fileName.endsWith(".DS_Store")
              ) {
                entry.autodrain();
              } else if (type === "File") {
                console.log(
                  `Processing entry - fileName: ${fileName}, type: ${type}, size: ${size}`
                );

                // Create product and sku object
                const fileParts = path.dirname(fileName).split("/");
                const collectionName = fileParts[0];
                const productName = fileParts[1];
                const skuName = path.basename(fileName, path.extname(fileName));
                console.log(`Uploading file: ${fileName} to bucket: ${Bucket}`);
                const uploadResult = await s3
                  .upload({
                    Bucket,
                    Key: `${newKey}/${fileName}`,
                    Body: entry,
                  })
                  .promise();

                const sku = {
                  skuTitle: skuName,
                  imageUrl: uploadResult.Location,
                };
                // Initialize the collection if it doesn't exist
                if (!tree[collectionName]) {
                  tree[collectionName] = {
                    collection: collectionName,
                    products: [],
                  };
                  console.log(
                    `Created Collection: ${JSON.stringify(
                      tree[collectionName]
                    )}`
                  );
                }

                // Find the product this sku belongs to
                let productNode = tree[collectionName].products.find(
                  (product) => product.title === productName
                );

                // If product doesn't exist, create a new one
                if (!productNode) {
                  productNode = { title: productName, sku: [] };
                  tree[collectionName].products.push(productNode);
                  console.log(
                    `Created Product: ${JSON.stringify(productNode)}`
                  );
                }

                // Add the sku to the product
                productNode.sku.push(sku);
                console.log(`Created SKU: ${JSON.stringify(productNode)}`);
                console.log(`Uploaded file: ${fileName} to bucket: ${Bucket}`);

                // Create an .OK file for the product
                const productOkKey = `${newKey}/${productName}.OK`;
                const productOkBody = JSON.stringify(productNode);
                await s3
                  .upload({
                    Bucket,
                    Key: productOkKey,
                    Body: productOkBody,
                  })
                  .promise();

                console.log(
                  `Uploaded ${productName}.OK file to bucket: ${Bucket}`
                );
                console.log("the content of .OK file :", productOkBody);
              } else {
                console.log(`Ignoring directory: ${fileName}`);
                entry.autodrain();
              }
            })();

            uploadPromises.push(processingPromise);
          })
          .on("finish", async () => {
            // Convert the tree to an array of collections and write it into A.OK and upload it to S3
            await Promise.all(uploadPromises); // 等待所有的上传操作完成
            const collections = Object.values(tree);
            const treeKey = `${newKey}/${newKey}.OK`;
            const treeBody = JSON.stringify(collections);
            console.log("the content of .OK file :", treeBody);
            await s3
              .upload({
                Bucket,
                Key: treeKey,
                Body: treeBody,
              })
              .promise();

            console.log(`Uploaded .OK file to bucket: ${Bucket}`);
            console.log(`Final tree structure: ${JSON.stringify(tree)}`);

            // Create a .OK.completed file to indicate all products have been processed
            const completedOkKey = `${newKey}/OK.completed`;
            await s3
              .upload({
                Bucket,
                Key: completedOkKey,
                Body: "",
              })
              .promise();

            console.log(`Uploaded OK.completed file to bucket: ${Bucket}`);

            resolve(); // Resolve the promise when unzip process is finished and A.OK is uploaded
          });
      });
  });

  console.log("Lambda function is about to end");
  return {
    statusCode: 200,
    body: JSON.stringify("Done!"),
  };
};

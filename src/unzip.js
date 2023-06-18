const fs = require("fs");
const unzipper = require("unzipper");
const path = require("path");

// 请确保这个路径指向你的 ZIP 文件
const filePath = "./folder-upload.zip";

fs.createReadStream(filePath)
  .pipe(unzipper.Parse())
  .on("entry", function (entry) {
    const fileName = entry.path;
    const type = entry.type; // 'Directory' or 'File'
    const size = entry.size;

    console.log(
      `Processing entry - fileName: ${fileName}, type: ${type}, size: ${size}`
    );

    if (type === "File") {
      // 创建父目录
      const dir = path.dirname(fileName);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 把文件解压到当前目录
      entry.pipe(fs.createWriteStream(fileName));
      console.log(`Unzipped file: ${fileName}`);
    } else {
      // 忽略目录
      console.log(`Ignoring directory: ${fileName}`);
      entry.autodrain();
    }
  })
  .on("error", function (err) {
    console.error("Error ", err);
  });
